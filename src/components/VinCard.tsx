import React, { useState } from 'react';
import { 
  validateVin, 
  sanitizeVinInput, 
  fixVinCheckDigit, 
  VinValidationResult 
} from '../utils/vin';
import { PackItem, formatBytes, packSingleVinZip, DownloadResult } from '../utils/zip';

interface VinCardProps {
  item: PackItem;
  index: number;
  onUpdateVin: (id: string, vin: string) => void;
  onRemove: (id: string) => void;
  onPreview: (item: PackItem) => void;
  onToast?: (message: string, type: 'success' | 'warning' | 'error') => void;
  onDownloadReady?: (result: DownloadResult) => void;
}

export const VinCard: React.FC<VinCardProps> = ({
  item,
  index,
  onUpdateVin,
  onRemove,
  onPreview,
  onToast,
  onDownloadReady,
}) => {
  const [isPacking, setIsPacking] = useState(false);
  const validation: VinValidationResult = validateVin(item.vin);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sanitized = sanitizeVinInput(e.target.value);
    onUpdateVin(item.id, sanitized);
  };

  const handleQuickFix = () => {
    const fixed = fixVinCheckDigit(item.vin);
    onUpdateVin(item.id, fixed);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const sanitized = sanitizeVinInput(text);
      if (sanitized) {
        onUpdateVin(item.id, sanitized);
      }
    } catch {
      // 剪贴板权限受限时忽略
    }
  };

  const handleClear = () => {
    onUpdateVin(item.id, '');
  };

  const handlePack = async () => {
    if (validation.status === 'error') {
      return;
    }

    try {
      setIsPacking(true);
      const result = await packSingleVinZip(item);
      onDownloadReady?.(result);
      onToast?.(`已打包并触发下载: ${result.filename}`, 'success');
    } catch (err) {
      console.error('打包失败:', err);
      onToast?.(`打包失败: ${err instanceof Error ? err.message : '处理异常'}`, 'error');
    } finally {
      setIsPacking(false);
    }
  };

  const canPack = validation.status === 'valid' || validation.status === 'warning';

  // 纯文字状态标签及样式配置
  const getStatusBadge = () => {
    switch (validation.status) {
      case 'valid':
        return {
          text: '校验通过',
          className: 'text-emerald-700 bg-emerald-50 border-emerald-300',
          inputBorder: 'border-emerald-500 focus:border-emerald-600',
          inputBg: 'bg-emerald-50/30',
        };
      case 'warning':
        return {
          text: '校验位不符，请核对',
          className: 'text-amber-800 bg-amber-50 border-amber-300',
          inputBorder: 'border-[#e67e22] focus:border-[#d35400]',
          inputBg: 'bg-amber-50/30',
        };
      case 'error':
      default:
        return {
          text: '格式不合法',
          className: 'text-rose-700 bg-rose-50 border-rose-300',
          inputBorder: 'border-rose-400 focus:border-rose-500',
          inputBg: 'bg-rose-50/20',
        };
    }
  };

  const statusConfig = getStatusBadge();

  return (
    <div className="bg-white rounded-md border border-slate-300 shadow-xs flex flex-col overflow-hidden text-slate-800">
      {/* 图像预览区域 */}
      <div 
        className="relative bg-slate-950 aspect-16/10 overflow-hidden cursor-pointer group"
        onClick={() => onPreview(item)}
      >
        <img
          src={item.previewUrl}
          alt={item.file.name}
          className="w-full h-full object-cover transition-opacity duration-150 group-hover:opacity-90"
        />
        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-medium">
          点击查看大图
        </div>

        <div className="absolute top-2 left-2 bg-slate-900/80 text-slate-200 text-xs px-2 py-0.5 rounded-xs font-mono">
          序号 {index + 1}
        </div>

        <div className="absolute top-2 right-2 bg-slate-900/80 text-slate-200 text-xs px-2 py-0.5 rounded-xs font-mono">
          {formatBytes(item.file.size)}
        </div>
      </div>

      {/* 字段与控制区域 */}
      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
        {/* 文件名与计数 */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="truncate max-w-[200px]" title={item.file.name}>
            {item.file.name}
          </span>
          <span className="font-mono text-slate-400">
            {item.vin.length} / 17
          </span>
        </div>

        {/* VIN 输入与状态 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">VIN</span>
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.2 rounded-xs border text-[11px] font-medium ${statusConfig.className}`}>
                {statusConfig.text}
              </span>
              <button
                type="button"
                onClick={handlePaste}
                className="text-slate-600 hover:text-slate-900 underline text-[11px]"
              >
                粘贴
              </button>
              {item.vin && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-slate-400 hover:text-slate-700 text-[11px]"
                >
                  清空
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <input
              type="text"
              value={item.vin}
              onChange={handleInputChange}
              maxLength={17}
              placeholder="请输入17位 VIN"
              spellCheck={false}
              autoCapitalize="characters"
              className={`w-full h-10 px-3 border rounded-md font-mono text-sm tracking-wider font-semibold uppercase outline-hidden transition-colors ${statusConfig.inputBorder} ${statusConfig.inputBg}`}
            />
          </div>

          {/* 状态详情说明 */}
          <div className="flex items-center justify-between min-h-[20px] text-xs pt-0.5">
            <span
              className={`leading-normal ${
                validation.status === 'valid'
                  ? 'text-emerald-700'
                  : validation.status === 'warning'
                  ? 'text-amber-800'
                  : 'text-rose-600'
              }`}
            >
              {validation.message}
            </span>

            {validation.canFix && (
              <button
                type="button"
                onClick={handleQuickFix}
                className="shrink-0 text-xs px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-md transition"
              >
                修正校验位
              </button>
            )}
          </div>
        </div>

        {/* 卡片操作按钮 */}
        <div className="pt-2.5 border-t border-slate-200 flex items-center gap-2">
          <button
            type="button"
            disabled={!canPack || isPacking}
            onClick={handlePack}
            className={`flex-1 h-9 px-3 rounded-md text-xs font-semibold transition flex items-center justify-center ${
              validation.status === 'warning'
                ? 'bg-[#e67e22] hover:bg-[#d35400] text-white'
                : validation.status === 'valid'
                ? 'bg-slate-900 hover:bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
            }`}
          >
            {isPacking ? '打包中...' : validation.status === 'warning' ? '仍然打包' : '打包'}
          </button>

          <button
            type="button"
            onClick={() => onRemove(item.id)}
            className="h-9 px-3 rounded-md border border-slate-300 text-slate-600 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-300 text-xs transition"
          >
            移除
          </button>
        </div>
      </div>
    </div>
  );
};
