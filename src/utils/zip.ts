/**
 * 客户端 ZIP 打包工具
 * 纯前端处理，结合 FileSaver 与 DOM 触发机制，兼容主流浏览器及各种环境
 */
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface PackItem {
  id: string;
  file: File;
  previewUrl: string;
  vin: string;
}

export interface DownloadResult {
  filename: string;
  blob: Blob;
  url: string;
  size: number;
}

/**
 * 可靠文件下载触发函数
 * 结合 FileSaver 与原生 DOM 标签双重保障，支持沙箱环境与移动端
 */
export function triggerDownload(blob: Blob, filename: string): string {
  const url = window.URL.createObjectURL(blob);

  // 1. 尝试使用经过多环境验证的 FileSaver
  try {
    saveAs(blob, filename);
  } catch (err) {
    console.warn('saveAs 异常，使用备用 DOM 下载:', err);
  }

  // 2. 结合原生 a 标签触发，确保在不同浏览器中均能执行下载指令
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        if (document.body.contains(a)) {
          document.body.removeChild(a);
        }
      } catch {
        // 忽略移除异常
      }
    }, 1000);
  } catch (domErr) {
    console.warn('DOM 下载触发异常:', domErr);
  }

  // 保持 ObjectURL 较长生命周期（60秒），避免下载流程未完成时链接失效
  setTimeout(() => {
    try {
      window.URL.revokeObjectURL(url);
    } catch {
      // 忽略清理异常
    }
  }, 60000);

  return url;
}

/**
 * 兼容旧方法名
 */
export function downloadBlob(blob: Blob, filename: string): string {
  return triggerDownload(blob, filename);
}

/**
 * 获取文件扩展名
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    return parts.pop()?.toLowerCase() || 'jpg';
  }
  return 'jpg';
}

/**
 * 格式化文件大小
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 打包单个车辆照片为 {VIN}.zip
 * 内部结构：{VIN}/{VIN}.{ext}
 */
export async function packSingleVinZip(item: PackItem): Promise<DownloadResult> {
  const cleanVin = item.vin.trim().toUpperCase();
  if (!cleanVin) throw new Error('VIN 不能为空');

  const zip = new JSZip();
  const ext = getFileExtension(item.file.name);
  const targetFileName = `${cleanVin}.${ext}`;

  // 读取底层 ArrayBuffer 确保数据稳定
  const arrayBuffer = await item.file.arrayBuffer();

  // 创建 {VIN}/ 目录，并将图片放入其中
  const folder = zip.folder(cleanVin);
  if (!folder) throw new Error('创建 ZIP 目录失败');

  folder.file(targetFileName, arrayBuffer);

  const content = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const filename = `${cleanVin}.zip`;
  const url = triggerDownload(content, filename);

  return {
    filename,
    blob: content,
    url,
    size: content.size,
  };
}

/**
 * 逐个下载所有有效项的独立 {VIN}.zip
 */
export async function packMultipleVinZipsIndividually(
  items: PackItem[],
  onProgress?: (current: number, total: number, vin: string) => void
): Promise<DownloadResult[]> {
  const total = items.length;
  const results: DownloadResult[] = [];

  for (let i = 0; i < total; i++) {
    const item = items[i];
    if (onProgress) {
      onProgress(i + 1, total, item.vin);
    }
    const result = await packSingleVinZip(item);
    results.push(result);
    
    // 设置间隔以降低浏览器并发下载拦截风险
    if (i < total - 1) {
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }

  return results;
}

/**
 * 打包所有有效项为汇总归档文件
 * 解压后直接展开所有包含的 [VIN]/ 文件夹，无多余包装层
 */
export async function packAllVinsIntoConsolidatedZip(
  items: PackItem[],
  archiveName?: string,
  onProgress?: (percentage: number, statusText: string) => void
): Promise<DownloadResult> {
  const zip = new JSZip();
  const total = items.length;
  const vinImageCountMap = new Map<string, number>();

  for (let i = 0; i < total; i++) {
    const item = items[i];
    const cleanVin = item.vin.trim().toUpperCase();
    const ext = getFileExtension(item.file.name);

    const count = (vinImageCountMap.get(cleanVin) || 0) + 1;
    vinImageCountMap.set(cleanVin, count);
    const targetFileName = count === 1 ? `${cleanVin}.${ext}` : `${cleanVin}_${count}.${ext}`;

    const arrayBuffer = await item.file.arrayBuffer();

    // 在 ZIP 根路径下直接为每个 VIN 创建独立文件夹，解压后直接展开所有包含的文件夹
    const folder = zip.folder(cleanVin);
    if (folder) {
      folder.file(targetFileName, arrayBuffer);
    }

    if (onProgress) {
      const pct = Math.round(((i + 1) / total) * 50);
      onProgress(pct, `处理进度 ${i + 1}/${total} (${cleanVin})`);
    }
  }

  if (onProgress) {
    onProgress(55, '正在压缩汇总归档文件...');
  }

  const content = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      if (onProgress) {
        const pct = 50 + Math.round(metadata.percent * 0.5);
        onProgress(pct, `压缩进度 ${Math.round(metadata.percent)}%`);
      }
    }
  );

  const defaultName = `VIN_ARCHIVE_${new Date().toISOString().slice(0, 10)}.zip`;
  const filename = archiveName || defaultName;
  const url = triggerDownload(content, filename);

  return {
    filename,
    blob: content,
    url,
    size: content.size,
  };
}
