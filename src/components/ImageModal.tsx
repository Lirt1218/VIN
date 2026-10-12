import React, { useState } from 'react';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
  vin: string;
}

export const ImageModal: React.FC<ImageModalProps> = ({
  isOpen,
  onClose,
  imageUrl,
  title,
  vin,
}) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  if (!isOpen) return null;

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.3, 3));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.3, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);
  const handleReset = () => {
    setScale(1);
    setRotation(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 select-none"
      onClick={onClose}
    >
      {/* 顶部控制栏 */}
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900 text-slate-100 px-4 py-2 rounded-md border border-slate-700 shadow-lg z-20 text-xs"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="font-mono text-slate-300 mr-2 max-w-[200px] truncate">
          {vin || title}
        </span>
        <button
          type="button"
          onClick={handleZoomIn}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-sm transition"
        >
          放大
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-sm transition"
        >
          缩小
        </button>
        <button
          type="button"
          onClick={handleRotate}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-sm transition"
        >
          旋转
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-sm transition"
        >
          还原
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 rounded-sm transition ml-1"
        >
          关闭
        </button>
      </div>

      {/* 图片展示区 */}
      <div
        className="relative max-w-full max-h-[85vh] overflow-hidden flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt={title}
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: 'transform 0.15s ease-out',
          }}
          className="max-h-[85vh] max-w-[90vw] object-contain rounded-md shadow-2xl"
        />
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-slate-400 bg-slate-900/80 px-3 py-1 rounded-md pointer-events-none border border-slate-800">
        双击或使用上方按钮缩放图片，点击空白区域关闭
      </div>
    </div>
  );
};
