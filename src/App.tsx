import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { VinCard } from './components/VinCard';
import { ImageModal } from './components/ImageModal';
import { validateVin, fixVinCheckDigit, sanitizeVinInput } from './utils/vin';
import {
  PackItem,
  DownloadResult,
  triggerDownload,
  formatBytes,
  packMultipleVinZipsIndividually,
  packAllVinsIntoConsolidatedZip,
} from './utils/zip';

export default function App() {
  const [items, setItems] = useState<PackItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewItem, setPreviewItem] = useState<PackItem | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'warning' | 'error'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showRules, setShowRules] = useState(false);

  // 打包进度状态
  const [isPackingAll, setIsPackingAll] = useState(false);
  const [packProgress, setPackProgress] = useState<{
    current: number;
    total: number;
    text: string;
    percentage: number;
  } | null>(null);

  // 最近生成的文件就绪状态（用于直接下载与备用链接）
  const [readyDownload, setReadyDownload] = useState<DownloadResult | null>(null);

  // 提示信息状态
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((message: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  // 处理文件加载
  const processFiles = useCallback((fileList: FileList | File[]) => {
    const rawFiles = Array.from(fileList);
    const validImageTypes = ['image/jpeg', 'image/png', 'image/webp'];

    const validImages = rawFiles.filter(
      (file) =>
        file.type.startsWith('image/') &&
        (validImageTypes.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name))
    );

    const nonImages = rawFiles.filter((f) => !validImages.includes(f));
    if (nonImages.length > 0) {
      showToast(`已过滤 ${nonImages.length} 个非图片文件`, 'warning');
    }

    if (validImages.length === 0) {
      if (rawFiles.length > 0) {
        showToast('未检测到有效的 JPG、PNG、WebP 文件', 'error');
      }
      return;
    }

    const newItems: PackItem[] = validImages.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
      const matchedVin = nameWithoutExt.match(/[A-HJ-NPR-Z0-9]{17}/i);
      const initialVin = matchedVin ? sanitizeVinInput(matchedVin[0]) : '';

      return {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        file,
        previewUrl,
        vin: initialVin,
      };
    });

    setItems((prev) => [...prev, ...newItems]);
    showToast(`已添加 ${newItems.length} 个文件`, 'success');
  }, [showToast]);

  // 剪贴板图片粘贴
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const files: File[] = [];
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        processFiles(files);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleUpdateVin = (id: string, vin: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, vin } : item))
    );
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleClearAll = () => {
    if (items.length === 0) return;
    if (window.confirm(`确认清空当前全部 ${items.length} 个项目？`)) {
      items.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setItems([]);
      showToast('已清空列表', 'success');
    }
  };

  // 修正全部黄色警告项的第9位校验位
  const handleFixAllWarnings = () => {
    let fixedCount = 0;
    setItems((prev) =>
      prev.map((item) => {
        const res = validateVin(item.vin);
        if (res.canFix) {
          fixedCount++;
          return { ...item, vin: fixVinCheckDigit(item.vin) };
        }
        return item;
      })
    );
    if (fixedCount > 0) {
      showToast(`已修正 ${fixedCount} 个校验位`, 'success');
    } else {
      showToast('当前无需修正的项目', 'warning');
    }
  };

  // 加载示例数据
  const handleLoadDemoSamples = async () => {
    const samples = [
      { vin: 'LFV3A25C7K1234567', label: '样本 A（校验通过）' },
      { vin: 'LBV2B1002N8888888', label: '样本 B（校验位不符）' },
      { vin: '1HGCR2F83HA123456', label: '样本 C（校验通过）' },
    ];

    const newItems: PackItem[] = [];

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, 900, 600);

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 4;
        ctx.strokeRect(30, 30, 840, 540);

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('VEHICLE IDENTIFICATION PLATE / 车辆铭牌', 60, 90);

        ctx.font = '20px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`标的说明: ${sample.label}`, 60, 160);
        ctx.fillText('出厂日期: 2024-05-18    制造代码: PASSENGER-CAR-CORP', 60, 210);

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(60, 260, 780, 140);
        ctx.strokeStyle = '#475569';
        ctx.strokeRect(60, 260, 780, 140);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '16px sans-serif';
        ctx.fillText('VIN 码', 80, 295);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px "Courier New", monospace';
        ctx.fillText(sample.vin, 80, 355);

        ctx.fillStyle = '#64748b';
        ctx.font = '15px sans-serif';
        ctx.fillText('本地测试画布渲染图像，用于功能验收', 60, 480);
      }

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9)
      );
      const file = new File([blob], `VIN_${sample.vin.slice(0, 8)}.jpg`, {
        type: 'image/jpeg',
      });
      const previewUrl = URL.createObjectURL(blob);

      newItems.push({
        id: `demo_${Date.now()}_${i}`,
        file,
        previewUrl,
        vin: sample.vin,
      });
    }

    setItems((prev) => [...prev, ...newItems]);
    showToast(`已加载 ${newItems.length} 条测试数据`, 'success');
  };

  // 统计数据 (校验通过与校验位不符均可打包，格式不合法跳过)
  const stats = useMemo(() => {
    let valid = 0;
    let warning = 0;
    let error = 0;

    items.forEach((item) => {
      const res = validateVin(item.vin);
      if (res.status === 'valid') valid++;
      else if (res.status === 'warning') warning++;
      else error++;
    });

    const packableCount = valid + warning;

    return {
      total: items.length,
      valid,
      warning,
      error,
      packableCount,
    };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const res = validateVin(item.vin);
      if (filterTab === 'valid' && res.status !== 'valid') return false;
      if (filterTab === 'warning' && res.status !== 'warning') return false;
      if (filterTab === 'error' && res.status !== 'error') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toUpperCase();
        const vinMatch = item.vin.toUpperCase().includes(q);
        const nameMatch = item.file.name.toUpperCase().includes(q);
        return vinMatch || nameMatch;
      }

      return true;
    });
  }, [items, filterTab, searchQuery]);

  // 批量下载独立压缩包
  const handlePackAllIndividually = async () => {
    const validItems = items.filter((item) => {
      const res = validateVin(item.vin);
      return res.status === 'valid' || res.status === 'warning';
    });

    if (validItems.length === 0) {
      showToast('无符合打包条件的项目', 'error');
      return;
    }

    try {
      setIsPackingAll(true);
      setPackProgress({
        current: 0,
        total: validItems.length,
        text: '准备批量生成压缩包...',
        percentage: 0,
      });

      const results = await packMultipleVinZipsIndividually(validItems, (cur, total, vin) => {
        setPackProgress({
          current: cur,
          total,
          text: `下载进度 [${cur}/${total}]: ${vin}.zip`,
          percentage: Math.round((cur / total) * 100),
        });
      });

      if (results.length > 0) {
        setReadyDownload(results[results.length - 1]);
      }

      showToast(`已处理完成并触发下载 ${validItems.length} 个压缩包`, 'success');
    } catch (err) {
      console.error(err);
      showToast('批量打包处理失败', 'error');
    } finally {
      setIsPackingAll(false);
      setPackProgress(null);
    }
  };

  // 生成汇总归档文件
  const handlePackConsolidatedZip = async () => {
    const validItems = items.filter((item) => {
      const res = validateVin(item.vin);
      return res.status === 'valid' || res.status === 'warning';
    });

    if (validItems.length === 0) {
      showToast('无符合打包条件的项目', 'error');
      return;
    }

    try {
      setIsPackingAll(true);
      setPackProgress({
        current: 0,
        total: validItems.length,
        text: '初始化归档压缩文件...',
        percentage: 5,
      });

      const result = await packAllVinsIntoConsolidatedZip(
        validItems,
        `VIN_ARCHIVE_${new Date().toISOString().slice(0, 10)}.zip`,
        (pct, text) => {
          setPackProgress({
            current: Math.round((pct / 100) * validItems.length),
            total: validItems.length,
            text,
            percentage: pct,
          });
        }
      );

      setReadyDownload(result);
      showToast('已生成汇总归档包（解压直接展开所有 [VIN] 文件夹）', 'success');
    } catch (err) {
      console.error(err);
      showToast('生成归档文件失败', 'error');
    } finally {
      setIsPackingAll(false);
      setPackProgress(null);
    }
  };

  // 导出单文件静态网页
  const handleExportStandaloneHtml = () => {
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>VIN 照片打包归档工具</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #0f172a; color: #f8fafc; min-height: 100vh; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #334155; }
        .header h1 { font-size: 20px; font-weight: 700; color: #f8fafc; margin-bottom: 4px; }
        .header p { font-size: 13px; color: #94a3b8; }
        .upload-box { border: 1px dashed #475569; border-radius: 6px; padding: 32px 20px; text-align: center; background: #1e293b; cursor: pointer; margin-bottom: 20px; transition: background 0.15s; }
        .upload-box:hover { background: #27354a; }
        .toolbar { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; align-items: center; justify-content: space-between; }
        .btn { height: 36px; padding: 0 16px; border: none; border-radius: 4px; font-weight: 600; font-size: 13px; cursor: pointer; transition: background 0.15s; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
        .btn-primary { background: #2563eb; color: #fff; }
        .btn-primary:hover:not(:disabled) { background: #1d4ed8; }
        .btn-orange { background: #e67e22; color: #fff; }
        .btn-orange:hover:not(:disabled) { background: #d35400; }
        .btn-secondary { background: #334155; color: #f8fafc; border: 1px solid #475569; }
        .btn-secondary:hover:not(:disabled) { background: #475569; }
        .btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
        .card { background: #ffffff; color: #0f172a; border-radius: 4px; overflow: hidden; border: 1px solid #cbd5e1; }
        .card img { width: 100%; height: 180px; object-fit: cover; background: #000; }
        .card-body { padding: 14px; }
        .card-filename { font-size: 12px; color: #64748b; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .vin-input { width: 100%; height: 38px; padding: 0 10px; font-family: "Courier New", monospace; font-size: 15px; font-weight: bold; border-radius: 4px; border: 1px solid #94a3b8; background: #ffffff; color: #0f172a; text-transform: uppercase; margin-bottom: 6px; outline: none; }
        .vin-input.valid { border-color: #10b981; background: #f0fdf4; }
        .vin-input.warning { border-color: #e67e22; background: #fffbeb; }
        .vin-input.error { border-color: #ef4444; background: #fef2f2; }
        .vin-tip { font-size: 12px; margin-bottom: 12px; min-height: 18px; }
        .vin-tip.valid { color: #047857; font-weight: 500; }
        .vin-tip.warning { color: #b45309; font-weight: 500; }
        .vin-tip.error { color: #b91c1c; }
        .card-actions { display: flex; gap: 8px; }
        .stats { display: flex; gap: 12px; font-size: 13px; color: #94a3b8; margin-bottom: 16px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>VIN 照片归档工具</h1>
            <p>单张照片生成独立 {VIN}.zip，内含 {VIN}/ 目录及照片文件</p>
        </div>
        <div class="upload-box" id="dropArea" onclick="document.getElementById('fileIn').click()">
            <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 4px;">点击或拖拽上传照片</h3>
            <p style="color:#94a3b8; font-size:12px;">支持 JPG、PNG、WebP 格式</p>
            <input type="file" id="fileIn" multiple accept="image/jpeg,image/png,image/webp" style="display:none">
        </div>
        <div class="toolbar">
            <div class="stats" id="statsBar">总计: 0 | 校验通过: 0 | 校验位不符: 0 | 格式不合法: 0</div>
            <div style="display:flex; gap:8px;">
                <button class="btn btn-secondary" id="clearBtn" disabled>清空列表</button>
                <button class="btn btn-primary" id="packAllBtn" disabled>打包全部有效项</button>
                <button class="btn btn-secondary" id="packConsolidatedBtn" disabled>生成汇总归档包</button>
            </div>
        </div>
        <div class="grid" id="cardsGrid"></div>
    </div>
    <script>
        const CHAR_MAP = {'A':1,'B':2,'C':3,'D':4,'E':5,'F':6,'G':7,'H':8,'J':1,'K':2,'L':3,'M':4,'N':5,'P':7,'R':9,'S':2,'T':3,'U':4,'V':5,'W':6,'X':7,'Y':8,'Z':9,'0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9};
        const WEIGHTS = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
        const REG = /^[A-HJ-NPR-Z0-9]{17}$/;
        let list = [];

        function calcCheckDigit(vin) {
            let sum = 0;
            for(let i=0; i<17; i++) {
                sum += (CHAR_MAP[vin[i]] || 0) * WEIGHTS[i];
            }
            const rem = sum % 11;
            return rem === 10 ? 'X' : String(rem);
        }

        function validate(vin) {
            if(!vin || vin.length !== 17 || !REG.test(vin)) return { status:'error', canPack: false, msg:'格式不合法' };
            const exp = calcCheckDigit(vin);
            if(vin[8] === exp) return { status:'valid', canPack: true, msg:'校验通过' };
            return { status:'warning', canPack: true, msg:'校验位不符，请核对（应为 ' + exp + '，当前为 ' + vin[8] + '）', exp };
        }

        function render() {
            const grid = document.getElementById('cardsGrid');
            grid.innerHTML = '';
            let valid = 0, warning = 0, error = 0;

            list.forEach((item, idx) => {
                const v = validate(item.vin);
                if(v.status === 'valid') valid++; else if(v.status === 'warning') warning++; else error++;
                const card = document.createElement('div');
                card.className = 'card';
                const btnClass = v.status === 'warning' ? 'btn-orange' : (v.status === 'valid' ? 'btn-primary' : 'btn-secondary');
                const btnText = v.status === 'warning' ? '仍然打包' : '打包';
                const btnDis = !v.canPack ? 'disabled' : '';

                card.innerHTML = \`
                    <img src="\${item.url}">
                    <div class="card-body">
                        <div class="card-filename">\${item.file.name}</div>
                        <input class="vin-input \${v.status}" value="\${item.vin}" placeholder="请输入17位 VIN" maxlength="17">
                        <div class="vin-tip \${v.status}">\${v.msg}</div>
                        <div class="card-actions">
                            <button class="btn \${btnClass}" style="flex:1" \${btnDis}>\${btnText}</button>
                            <button class="btn btn-secondary">移除</button>
                        </div>
                    </div>
                \`;
                const input = card.querySelector('input');
                input.oninput = (e) => {
                    item.vin = e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g,'').slice(0,17);
                    render();
                };
                card.querySelectorAll('button')[0].onclick = () => packOne(item);
                card.querySelectorAll('button')[1].onclick = () => { list.splice(idx, 1); render(); };
                grid.appendChild(card);
            });

            const packable = valid + warning;
            document.getElementById('statsBar').innerText = \`总计: \${list.length} | 校验通过: \${valid} | 校验位不符: \${warning} | 格式不合法: \${error}\`;
            document.getElementById('packAllBtn').disabled = packable === 0;
            document.getElementById('packAllBtn').innerText = \`打包全部有效项 (\${packable})\`;
            document.getElementById('packConsolidatedBtn').disabled = packable === 0;
            document.getElementById('clearBtn').disabled = list.length === 0;
        }

        async function packOne(item) {
            const v = validate(item.vin);
            if (!v.canPack) return;
            const zip = new JSZip();
            const ext = item.file.name.split('.').pop() || 'jpg';
            zip.folder(item.vin).file(item.vin + '.' + ext, item.file);
            const content = await zip.generateAsync({type:'blob'});
            saveAs(content, item.vin + '.zip');
        }

        async function packAll() {
            const valids = list.filter(i => validate(i.vin).canPack);
            for(let i=0; i<valids.length; i++) {
                await packOne(valids[i]);
                await new Promise(r => setTimeout(r, 350));
            }
        }

        async function packConsolidated() {
            const valids = list.filter(i => validate(i.vin).canPack);
            if (valids.length === 0) return;
            const zip = new JSZip();
            const vinCount = {};
            for(let i=0; i<valids.length; i++) {
                const item = valids[i];
                const cleanVin = item.vin.trim().toUpperCase();
                const ext = item.file.name.split('.').pop() || 'jpg';
                vinCount[cleanVin] = (vinCount[cleanVin] || 0) + 1;
                const count = vinCount[cleanVin];
                const fileName = count === 1 ? (cleanVin + '.' + ext) : (cleanVin + '_' + count + '.' + ext);
                zip.folder(cleanVin).file(fileName, item.file);
            }
            const content = await zip.generateAsync({type:'blob'});
            saveAs(content, 'VIN_ARCHIVE_' + new Date().toISOString().slice(0, 10) + '.zip');
        }

        document.getElementById('fileIn').onchange = (e) => {
            Array.from(e.target.files).forEach(f => {
                if(f.type.startsWith('image/')) list.push({ file: f, url: URL.createObjectURL(f), vin: '' });
            });
            render();
        };
        document.getElementById('clearBtn').onclick = () => { list = []; render(); };
        document.getElementById('packAllBtn').onclick = packAll;
        document.getElementById('packConsolidatedBtn').onclick = packConsolidated;
    <\/script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = triggerDownload(blob, 'index.html');
    setReadyDownload({
      filename: 'index.html',
      blob,
      url,
      size: blob.size,
    });
    showToast('已导出单文件 index.html', 'success');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 顶部标题与导航 */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-base font-semibold text-white tracking-tight">
                VIN 照片归档工具
              </h1>
              <span className="text-[11px] text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-sm font-mono">
                纯客户端离线处理
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              单张照片生成独立 [VIN].zip，压缩包内含 [VIN]/ 目录及照片文件
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <button
              type="button"
              onClick={handleLoadDemoSamples}
              className="h-8 px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              载入示例数据
            </button>

            <button
              type="button"
              onClick={() => setShowRules(!showRules)}
              className="h-8 px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              校验说明
            </button>

            <button
              type="button"
              onClick={handleExportStandaloneHtml}
              className="h-8 px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
            >
              导出独立页面
            </button>

            <a
              href={typeof window !== 'undefined' ? window.location.href : '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center justify-center"
              title="在独立标签页中打开，直接使用原生浏览器下载能力"
            >
              新窗口打开
            </a>
          </div>
        </div>
      </header>

      {/* 主工作区 */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {/* 校验说明面板 */}
        {showRules && (
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4 text-xs text-slate-300 space-y-3">
            <div className="flex items-center justify-between font-semibold text-slate-200">
              <span>ISO 3779 / SAE 车架号 (VIN) 规范说明</span>
              <button
                type="button"
                onClick={() => setShowRules(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                关闭
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-slate-300 leading-relaxed">
              <div className="bg-slate-950/60 p-3 rounded-md border border-slate-800">
                <div className="text-rose-400 font-semibold mb-1">格式不合法（红色）</div>
                <p>长度不足或超出 17 位，或者包含规范明确排除的字母 I、O、Q 及特殊符号。该状态禁止打包。</p>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-md border border-slate-800">
                <div className="text-amber-400 font-semibold mb-1">校验位不符，请核对（黄色）</div>
                <p>长度与字符均符合规范，但第 9 位与加权模 11 算法计算结果不一致。该状态支持使用橙色按钮仍然打包，亦可手动修正。</p>
              </div>
              <div className="bg-slate-950/60 p-3 rounded-md border border-slate-800">
                <div className="text-emerald-400 font-semibold mb-1">校验通过（绿色）</div>
                <p>长度、字符集与第 9 位校验位均完全符合规范，可正常打包。</p>
              </div>
            </div>
          </div>
        )}

        {/* 上传区域 */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-blue-500 bg-blue-950/20'
              : 'border-slate-700 hover:border-slate-500 bg-slate-900/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/jpg"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                processFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                processFiles(e.target.files);
                e.target.value = '';
              }
            }}
          />

          <div className="flex flex-col items-center justify-center space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">
              点击或拖拽上传照片
            </h2>
            <p className="text-xs text-slate-400">
              支持 JPG、PNG、WebP 格式，支持批量选择，支持剪贴板粘贴
            </p>

            <div
              className="flex items-center gap-2 pt-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-md transition"
              >
                选择文件
              </button>

              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="h-8 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-md border border-slate-700 transition"
              >
                拍照上传
              </button>
            </div>
          </div>
        </div>

        {/* 筛选与批量控制 */}
        {items.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3.5 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* 状态统计筛选 */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className={`text-xs h-7 px-2.5 rounded-sm transition ${
                    filterTab === 'all'
                      ? 'bg-slate-800 text-white border border-slate-600'
                      : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  全部 ({stats.total})
                </button>

                <button
                  type="button"
                  onClick={() => setFilterTab('valid')}
                  className={`text-xs h-7 px-2.5 rounded-sm transition ${
                    filterTab === 'valid'
                      ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                      : 'bg-slate-950 text-emerald-400/90 border border-slate-800 hover:text-emerald-300'
                  }`}
                >
                  校验通过 ({stats.valid})
                </button>

                <button
                  type="button"
                  onClick={() => setFilterTab('warning')}
                  className={`text-xs h-7 px-2.5 rounded-sm transition ${
                    filterTab === 'warning'
                      ? 'bg-amber-950 text-amber-300 border border-amber-700'
                      : 'bg-slate-950 text-amber-400/90 border border-slate-800 hover:text-amber-300'
                  }`}
                >
                  校验位不符 ({stats.warning})
                </button>

                <button
                  type="button"
                  onClick={() => setFilterTab('error')}
                  className={`text-xs h-7 px-2.5 rounded-sm transition ${
                    filterTab === 'error'
                      ? 'bg-rose-950 text-rose-300 border border-rose-700'
                      : 'bg-slate-950 text-rose-400/90 border border-slate-800 hover:text-rose-300'
                  }`}
                >
                  格式不合法 ({stats.error})
                </button>
              </div>

              {/* 搜索 */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索 VIN 或文件名..."
                  className="w-48 h-7 bg-slate-950 border border-slate-700 rounded-sm px-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-blue-500"
                />
              </div>
            </div>

            {/* 操作控制行 */}
            <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                {stats.warning > 0 && (
                  <button
                    type="button"
                    onClick={handleFixAllWarnings}
                    className="h-8 px-2.5 text-xs bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-700/60 rounded-md transition"
                  >
                    修正全部校验位 ({stats.warning})
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClearAll}
                  className="h-8 px-2.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-md transition"
                >
                  清空列表
                </button>
              </div>

              {/* 批量打包按钮 */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  disabled={stats.packableCount === 0 || isPackingAll}
                  onClick={handlePackAllIndividually}
                  className={`h-8 px-3 text-xs font-semibold rounded-md transition ${
                    stats.packableCount > 0 && !isPackingAll
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  }`}
                  title="为每一个有效项目逐个生成并下载独立的 [VIN].zip"
                >
                  打包全部有效项 ({stats.packableCount})
                </button>

                <button
                  type="button"
                  disabled={stats.packableCount === 0 || isPackingAll}
                  onClick={handlePackConsolidatedZip}
                  className={`h-8 px-3 text-xs font-semibold rounded-md transition border ${
                    stats.packableCount > 0 && !isPackingAll
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-600'
                      : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
                  }`}
                  title="将所有有效项目整合为单个归档压缩文件"
                >
                  生成汇总归档包
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 批量处理进度条 */}
        {packProgress && (
          <div className="bg-slate-900 border border-slate-800 rounded-md p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300 font-medium">
              <span>{packProgress.text}</span>
              <span className="font-mono">
                {packProgress.current} / {packProgress.total} ({packProgress.percentage}%)
              </span>
            </div>
            <div className="w-full bg-slate-950 rounded-xs h-1.5 overflow-hidden border border-slate-800">
              <div
                className="bg-blue-500 h-full transition-all duration-300"
                style={{ width: `${packProgress.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* 卡片列表 */}
        {items.length === 0 ? (
          <div className="text-center py-16 px-4 border border-dashed border-slate-800 rounded-md bg-slate-900/30">
            <h3 className="text-sm font-semibold text-slate-300 mb-1">
              暂无照片
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
              可上传照片或载入示例数据进行处理
            </p>
            <button
              type="button"
              onClick={handleLoadDemoSamples}
              className="h-8 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-md border border-slate-700 transition"
            >
              载入示例数据
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 px-4 border border-slate-800 rounded-md bg-slate-900/30 text-slate-400 text-xs">
            无符合筛选条件的项目
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredItems.map((item, idx) => (
              <VinCard
                key={item.id}
                item={item}
                index={idx}
                onUpdateVin={handleUpdateVin}
                onRemove={handleRemoveItem}
                onPreview={(i) => setPreviewItem(i)}
                onToast={showToast}
                onDownloadReady={(res) => setReadyDownload(res)}
              />
            ))}
          </div>
        )}
      </main>

      {/* 底部信息栏 */}
      <footer className="border-t border-slate-800/80 bg-slate-900 py-3 px-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            VIN 照片归档工具 | 客户端本地处理
          </span>
          <span className="font-mono text-slate-500">
            ISO 3779
          </span>
        </div>
      </footer>

      {/* 大图检视 */}
      <ImageModal
        isOpen={Boolean(previewItem)}
        onClose={() => setPreviewItem(null)}
        imageUrl={previewItem?.previewUrl || ''}
        title={previewItem?.file.name || ''}
        vin={previewItem?.vin || ''}
      />

      {/* 文件就绪提示与备用下载链接 */}
      {readyDownload && (
        <aside
          aria-label="下载文件浮层"
          className="fixed bottom-6 right-6 z-50 w-80 bg-slate-900 border border-slate-700 rounded-md shadow-2xl p-4 text-xs space-y-3 text-slate-200"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-semibold text-white">文件已生成</span>
            <button
              type="button"
              onClick={() => setReadyDownload(null)}
              className="text-slate-400 hover:text-white"
            >
              关闭
            </button>
          </div>
          <div className="space-y-1">
            <div className="font-mono text-white truncate" title={readyDownload.filename}>
              {readyDownload.filename}
            </div>
            <div className="text-slate-400">
              文件大小: {formatBytes(readyDownload.size)}
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <a
              href={readyDownload.url}
              download={readyDownload.filename}
              className="flex-1 h-8 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-md flex items-center justify-center transition"
            >
              点击保存文件
            </a>
            <a
              href={readyDownload.url}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-md flex items-center justify-center transition"
              title="在浏览器新标签页中打开/保存"
            >
              新窗口
            </a>
          </div>
        </aside>
      )}

      {/* 提示消息 */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-md shadow-xl text-xs font-semibold text-white transition-opacity ${
            toast.type === 'error'
              ? 'bg-rose-700'
              : toast.type === 'warning'
              ? 'bg-amber-700'
              : 'bg-slate-800 border border-slate-700'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
