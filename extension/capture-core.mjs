const INVALID_WINDOWS_CHARS = /[<>:"/\\|?*\u0000-\u001F]/;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function validateProjectName(rawName) {
  const value = String(rawName ?? "").trim();

  if (!value) {
    return { valid: false, value, error: "폴더 이름을 먼저 정확하게 써주세요." };
  }

  if (value === "." || value === "..") {
    return { valid: false, value, error: "이 이름은 폴더 이름으로 쓸 수 없습니다." };
  }

  if (INVALID_WINDOWS_CHARS.test(value) || /[. ]$/.test(value)) {
    return {
      valid: false,
      value,
      error: "폴더 이름에는 < > : \" / \\ | ? * 를 쓸 수 없습니다."
    };
  }

  if (RESERVED_WINDOWS_NAMES.test(value)) {
    return { valid: false, value, error: "윈도우에서 사용할 수 없는 폴더 이름입니다." };
  }

  return { valid: true, value, error: "" };
}

export function normalizeSelectionRange({ startY, endY }) {
  const top = Math.min(Number(startY), Number(endY));
  const bottom = Math.max(Number(startY), Number(endY));
  return { startY: top, endY: bottom };
}

export function hasRemainingCaptureArea({
  cursorY,
  rangeEndY,
  tolerance = 1
}) {
  return Number(rangeEndY) - Number(cursorY) > Number(tolerance);
}

export function calculateVisibleCaptureSlice({
  cursorY,
  rangeEndY,
  scrollY,
  contentHeight
}) {
  const cropTop = Math.max(0, Number(cursorY) - Number(scrollY));
  const availableHeight = Math.max(0, Number(contentHeight) - cropTop);
  const remainingHeight = Math.max(0, Number(rangeEndY) - Number(cursorY));

  return {
    cropTop,
    height: Math.min(remainingHeight, availableHeight)
  };
}

export function findNextCaptureNumber(fileNames) {
  const numbers = [...fileNames]
    .map((name) => /^(\d+)(?:-\d+)?\.(?:jpe?g|png)$/i.exec(name))
    .filter(Boolean)
    .map((match) => Number.parseInt(match[1], 10))
    .filter(Number.isFinite);

  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

export function getProductPhotoNames(fileNames) {
  return [...fileNames]
    .filter((name) => /^제품사진(?:-\d+)?\.(?:jpe?g|png|webp)$/i.test(name))
    .sort((left, right) => {
      const numberFor = (name) => {
        const match = /^제품사진(?:-(\d+))?\./i.exec(name);
        return match?.[1] ? Number.parseInt(match[1], 10) : 1;
      };
      return numberFor(left) - numberFor(right);
    });
}

export function hasProductPhoto(fileNames) {
  return getProductPhotoNames(fileNames).length > 0;
}

export function nextProductPhotoName(fileNames, extension = "jpg") {
  const outputExtension =
    String(extension).toLowerCase().replace(/^\./, "") === "png" ? "png" : "jpg";
  const usedNumbers = new Set(
    [...fileNames]
      .map((name) => /^제품사진(?:-(\d+))?\.(?:jpe?g|png|webp)$/i.exec(name))
      .filter(Boolean)
      .map((match) => match[1] ? Number.parseInt(match[1], 10) : 1)
  );

  if (!usedNumbers.has(1)) return `제품사진.${outputExtension}`;

  let suffix = 2;
  while (usedNumbers.has(suffix)) suffix += 1;
  return `제품사진-${suffix}.${outputExtension}`;
}
