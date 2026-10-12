/**
 * VIN (Vehicle Identification Number) 校验工具库
 * 符合 ISO 3779 / SAE 标准
 */

// 字母转对应数字权重表 (排除字母 I, O, Q)
export const VIN_CHAR_MAP: Record<string, number> = {
  'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
  'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'P': 7, 'R': 9,
  'S': 2, 'T': 3, 'U': 4, 'V': 5, 'W': 6, 'X': 7, 'Y': 8, 'Z': 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};

// 17位权重表 (第9位为校验位，计算权重为 0)
export const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// VIN 正则匹配 (17位，仅包含数字和允许的大写字母，无 I, O, Q)
export const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;

export type VinValidationStatus = 'error' | 'warning' | 'valid';

export interface VinValidationResult {
  status: VinValidationStatus;
  isValid: boolean;
  hasValidFormat: boolean;
  checkDigitMatch: boolean;
  expectedCheckDigit: string | null;
  actualCheckDigit: string | null;
  message: string;
  canFix: boolean;
}

/**
 * 计算 17 位 VIN 的标准校验位 (第9位)
 */
export function calculateCheckDigit(vin: string): string | null {
  if (!vin || vin.length !== 17) return null;
  const upper = vin.toUpperCase();

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const char = upper[i];
    const value = VIN_CHAR_MAP[char];
    if (value === undefined) return null;
    sum += value * VIN_WEIGHTS[i];
  }

  const remainder = sum % 11;
  return remainder === 10 ? 'X' : String(remainder);
}

/**
 * 校验 VIN 状态
 * 1. 长度!=17 或含非法字符 -> 格式不合法 (error)
 * 2. 格式合法但第9位与计算值不符 -> 校验位不符，请核对 (warning)
 * 3. 格式合法且第9位吻合 -> 校验通过 (valid)
 */
export function validateVin(vin: string): VinValidationResult {
  if (!vin || vin.trim() === '') {
    return {
      status: 'error',
      isValid: false,
      hasValidFormat: false,
      checkDigitMatch: false,
      expectedCheckDigit: null,
      actualCheckDigit: null,
      message: '请输入17位 VIN',
      canFix: false,
    };
  }

  const upper = vin.toUpperCase().trim();

  // 检查是否包含排除字母 I、O、Q
  if (/[IOQ]/.test(upper)) {
    return {
      status: 'error',
      isValid: false,
      hasValidFormat: false,
      checkDigitMatch: false,
      expectedCheckDigit: null,
      actualCheckDigit: null,
      message: '格式不合法（包含排除字母 I、O、Q）',
      canFix: false,
    };
  }

  // 检查长度
  if (upper.length !== 17) {
    const diff = 17 - upper.length;
    return {
      status: 'error',
      isValid: false,
      hasValidFormat: false,
      checkDigitMatch: false,
      expectedCheckDigit: null,
      actualCheckDigit: null,
      message: diff > 0 ? `格式不合法（当前 ${upper.length} 位，缺少 ${diff} 位）` : `格式不合法（当前 ${upper.length} 位，超出 17 位）`,
      canFix: false,
    };
  }

  // 检查字符集
  if (!VIN_REGEX.test(upper)) {
    return {
      status: 'error',
      isValid: false,
      hasValidFormat: false,
      checkDigitMatch: false,
      expectedCheckDigit: null,
      actualCheckDigit: null,
      message: '格式不合法（包含非规范字符）',
      canFix: false,
    };
  }

  // 格式合法，比对第9位
  const expected = calculateCheckDigit(upper);
  const actual = upper[8];
  const isMatch = expected === actual;

  if (isMatch) {
    return {
      status: 'valid',
      isValid: true,
      hasValidFormat: true,
      checkDigitMatch: true,
      expectedCheckDigit: expected,
      actualCheckDigit: actual,
      message: '校验通过',
      canFix: false,
    };
  } else {
    return {
      status: 'warning',
      isValid: false,
      hasValidFormat: true,
      checkDigitMatch: false,
      expectedCheckDigit: expected,
      actualCheckDigit: actual,
      message: `校验位不符，请核对（应为 ${expected}，当前为 ${actual}）`,
      canFix: true,
    };
  }
}

/**
 * 修正第9位为计算得出的标准校验位
 */
export function fixVinCheckDigit(vin: string): string {
  const upper = sanitizeVinInput(vin);
  if (upper.length !== 17 || !VIN_REGEX.test(upper)) return upper;
  const expected = calculateCheckDigit(upper);
  if (!expected) return upper;
  return upper.slice(0, 8) + expected + upper.slice(9);
}

/**
 * 清洗输入：自动转大写，过滤非法字符，截取17位
 */
export function sanitizeVinInput(input: string): string {
  if (!input) return '';
  return input
    .toUpperCase()
    .replace(/[^A-HJ-NPR-Z0-9]/g, '')
    .slice(0, 17);
}
