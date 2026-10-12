/**
 * 客户端 ZIP 打包工具
 * 基于 JSZip 和 FileSaver，纯前端处理
 */
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export interface PackItem {
  id: string;
  file: File;
  previewUrl: string;
  vin: string;
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
export async function packSingleVinZip(item: PackItem): Promise<void> {
  const cleanVin = item.vin.trim().toUpperCase();
  if (!cleanVin) throw new Error('VIN 不能为空');

  const zip = new JSZip();
  const ext = getFileExtension(item.file.name);
  const targetFileName = `${cleanVin}.${ext}`;

  // 创建 {VIN}/ 目录，并将图片放入其中
  const folder = zip.folder(cleanVin);
  if (!folder) throw new Error('创建 ZIP 目录失败');

  // 直接写入 File 对象
  folder.file(targetFileName, item.file);

  const content = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  saveAs(content, `${cleanVin}.zip`);
}

/**
 * 逐个下载所有有效项的独立 {VIN}.zip
 */
export async function packMultipleVinZipsIndividually(
  items: PackItem[],
  onProgress?: (current: number, total: number, vin: string) => void
): Promise<void> {
  const total = items.length;
  for (let i = 0; i < total; i++) {
    const item = items[i];
    if (onProgress) {
      onProgress(i + 1, total, item.vin);
    }
    await packSingleVinZip(item);
    
    // 设置间隔以避免浏览器下载拦截
    if (i < total - 1) {
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}

/**
 * 打包所有有效项为汇总归档文件
 */
export async function packAllVinsIntoConsolidatedZip(
  items: PackItem[],
  archiveName?: string,
  onProgress?: (percentage: number, statusText: string) => void
): Promise<void> {
  const zip = new JSZip();
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    const cleanVin = item.vin.trim().toUpperCase();
    const ext = getFileExtension(item.file.name);
    const targetFileName = `${cleanVin}.${ext}`;

    const folder = zip.folder(cleanVin);
    if (folder) {
      folder.file(targetFileName, item.file);
    }

    if (onProgress) {
      const pct = Math.round(((i + 1) / total) * 50);
      onProgress(pct, `处理进度 ${i + 1}/${total} (${cleanVin})`);
    }
  }

  if (onProgress) {
    onProgress(55, '正在压缩文件...');
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
  saveAs(content, archiveName || defaultName);
}
