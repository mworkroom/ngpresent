import {
  calculateVisibleCaptureSlice,
  findNextCaptureNumber,
  getProductPhotoNames,
  hasRemainingCaptureArea,
  nextProductPhotoName,
  normalizeSelectionRange,
  validateProjectName
} from "./capture-core.mjs";

const ROOT_FOLDER_NAME = "교육 자료";
const DB_NAME = "nangok-education-capture";
const DB_VERSION = 1;
const STORE_NAME = "folder-handles";
const ROOT_HANDLE_KEY = "education-materials-root";
const CAPTURE_DELAY_MS = 560;
const CAPTURE_POSITION_RETRIES = 3;
const MAX_OUTPUT_HEIGHT = 32760;
const MAX_OUTPUT_PIXELS = 120_000_000;

const $ = (selector) => document.querySelector(selector);
const rootState = $("#root-state");
const rootLabel = $("#root-label");
const pickRootButton = $("#pick-root");
const projectNameInput = $("#project-name");
const pathPreview = $("#path-preview");
const nameError = $("#name-error");
const startButton = $("#start");
const setupCard = $("#setup-card");
const productCard = $("#product-card");
const savedProducts = $("#saved-products");
const productCount = $("#product-count");
const productFileList = $("#product-file-list");
const pickProductLabel = $("#pick-product-label");
const finishProductButton = $("#finish-product");
const finishProductHint = $("#finish-product-hint");
const captureCard = $("#capture-card");
const captureHelp = $("#capture-help");
const counterLabel = $("#counter-label");
const instruction = $("#instruction");
const selectionSummary = $("#selection-summary");
const selectionSize = $("#selection-size");
const captureActions = $("#capture-actions");
const saveNumberedButton = $("#save-numbered");
const saveNumberedLabel = $("#save-numbered-label");
const pickProductButton = $("#pick-product");
const selectAgainButton = $("#select-again");
const newSelectionButton = $("#new-selection");
const status = $("#status");
const busy = $("#busy");
const busyTitle = $("#busy-title");
const busyMessage = $("#busy-message");

let rootHandle = null;
let projectHandle = null;
let projectFileNames = new Set();
let projectName = "";
let captureTab = null;
let selection = null;
let nextNumber = 1;
let working = false;

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function setStatus(text = "", kind = "") {
  status.textContent = text;
  status.dataset.kind = kind;
}

function setBusy(visible, title = "", message = "") {
  busy.hidden = !visible;
  if (title) busyTitle.textContent = title;
  if (message) busyMessage.textContent = message;
}

function setRootReady(ready, label) {
  rootState.dataset.ready = String(ready);
  rootLabel.textContent = label;
  updateStartButton();
}

function currentNameResult() {
  return validateProjectName(projectNameInput.value);
}

function updateStartButton() {
  const result = currentNameResult();
  nameError.textContent =
    projectNameInput.value && !result.valid ? result.error : "";
  pathPreview.textContent =
    `${ROOT_FOLDER_NAME} \\ ${result.value || "새 폴더 이름"}`;
  startButton.disabled = !rootHandle || !result.valid || working;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveRootHandle(handle) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(handle, ROOT_HANDLE_KEY);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function loadRootHandle() {
  const database = await openDatabase();
  const handle = await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(ROOT_HANDLE_KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return handle;
}

async function hasWritePermission(handle, request = false) {
  if (!handle) return false;
  const options = { mode: "readwrite" };
  if (await handle.queryPermission(options) === "granted") return true;
  if (!request) return false;
  return (await handle.requestPermission(options)) === "granted";
}

async function pickRootFolder() {
  if (!window.showDirectoryPicker) {
    setStatus("이 크롬에서는 폴더 선택 기능을 사용할 수 없습니다.", "error");
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      id: "nangok-education-materials",
      mode: "readwrite",
      startIn: "desktop"
    });

    if (handle.name !== ROOT_FOLDER_NAME) {
      setStatus(
        `‘${ROOT_FOLDER_NAME}’ 폴더를 선택해야 합니다. 방금 선택한 폴더는 ‘${handle.name}’입니다.`,
        "error"
      );
      return;
    }

    if (!(await hasWritePermission(handle, true))) {
      throw new Error("폴더 저장 권한을 받지 못했습니다.");
    }

    rootHandle = handle;
    await saveRootHandle(handle);
    setRootReady(true, `선택됨: ${ROOT_FOLDER_NAME}`);
    setStatus("저장할 기본 폴더를 기억했습니다.", "success");
    projectNameInput.focus();
  } catch (error) {
    if (error?.name === "AbortError") return;
    console.error(error);
    setStatus(error.message || "폴더를 선택하지 못했습니다.", "error");
  }
}

async function getActiveProductTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/kr\.atomy\.com\/product\//.test(tab.url || "")) {
    throw new Error("애터미 상품 페이지를 먼저 열어주세요.");
  }
  return tab;
}

async function sendToProduct(message) {
  if (!captureTab?.id) throw new Error("상품 페이지 연결이 끊어졌습니다.");
  try {
    const response = await chrome.tabs.sendMessage(captureTab.id, message);
    if (!response?.ok) {
      throw new Error(response?.error || "상품 페이지에서 작업하지 못했습니다.");
    }
    return response;
  } catch (error) {
    throw new Error(
      "상품 페이지를 새로고침한 뒤 다시 눌러주세요.",
      { cause: error }
    );
  }
}

async function reloadAndWaitForProductPage(tabId) {
  await chrome.tabs.reload(tabId);
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId);
    const currentUrl = tab.pendingUrl || tab.url || "";
    if (
      currentUrl &&
      !/^https:\/\/kr\.atomy\.com\/product\//.test(currentUrl)
    ) {
      throw new Error("새로고침 중 애터미 상품 페이지를 벗어났습니다.");
    }

    if (tab.status === "complete") {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: "NG_CAPTURE_PING"
        });
        if (response?.ok) {
          captureTab = tab;
          return;
        }
      } catch {
        // document_idle에서 콘텐츠 스크립트가 연결될 때까지 잠시 기다립니다.
      }
    }

    await sleep(250);
  }

  throw new Error("상품 페이지 준비 시간이 너무 오래 걸립니다. 다시 시작해주세요.");
}

function updateProductPhotoState() {
  const names = getProductPhotoNames(projectFileNames);
  const count = names.length;
  savedProducts.dataset.empty = String(count === 0);
  productCount.textContent = `저장된 제품사진: ${count}장`;
  productFileList.replaceChildren(
    ...names.map((name) => {
      const item = document.createElement("li");
      item.textContent = name;
      return item;
    })
  );
  pickProductLabel.textContent =
    count === 0 ? "제품사진 저장하기" : "제품사진 한 장 더 저장하기";
  finishProductButton.disabled = count === 0 || working;
  finishProductHint.textContent =
    count === 0
      ? "제품사진을 한 장 이상 저장해야 다음으로 갈 수 있습니다."
      : "더 필요한 사진이 없으면 ‘제품사진 저장 완료’를 눌러주세요.";
}

async function readProjectFileNames() {
  const names = [];
  for await (const entry of projectHandle.values()) {
    if (entry.kind === "file") names.push(entry.name);
  }
  projectFileNames = new Set(names);
  nextNumber = findNextCaptureNumber(names);
  updateProductPhotoState();
}

function showWaitingForStart() {
  selection = null;
  instruction.hidden = false;
  instruction.innerHTML =
    "<b>상품 페이지에서</b><span>그림의 맨 위를 한 번 눌러주세요.</span>";
  selectionSummary.hidden = true;
  captureActions.hidden = true;
  newSelectionButton.hidden = true;
  counterLabel.textContent = `다음 파일: ${nextNumber}.jpg`;
  saveNumberedLabel.textContent = `${nextNumber}번으로 저장`;
}

async function beginSelection({
  scrollToDetail = false,
  successMessage = ""
} = {}) {
  try {
    showWaitingForStart();
    await sendToProduct({
      type: "NG_CAPTURE_BEGIN_SELECTION",
      scrollToDetail
    });
    setStatus(
      successMessage || "상품 페이지 가운데에서 그림의 맨 위를 눌러주세요.",
      successMessage ? "success" : ""
    );
    return true;
  } catch (error) {
    console.info("상품 페이지 연결을 기다리고 있습니다.", error.message);
    setStatus(error.message, "error");
    newSelectionButton.hidden = false;
    return false;
  }
}

async function beginProductPhotoSelection() {
  if (working) return;

  try {
    selection = null;
    await sendToProduct({ type: "NG_CAPTURE_BEGIN_PRODUCT_PHOTO" });
    setStatus("상품 페이지에서 파란 테두리의 제품사진을 한 번 눌러주세요.");
  } catch (error) {
    console.info("상품 페이지 연결을 기다리고 있습니다.", error.message);
    setStatus(error.message, "error");
  }
}

async function startSession() {
  const result = currentNameResult();
  if (!rootHandle || !result.valid || working) return;

  working = true;
  updateStartButton();
  setStatus();

  try {
    if (!(await hasWritePermission(rootHandle, true))) {
      throw new Error("‘교육 자료’ 폴더 사용을 허용해주세요.");
    }

    captureTab = await getActiveProductTab();
    projectName = result.value;
    projectHandle = await rootHandle.getDirectoryHandle(projectName, {
      create: true
    });
    await readProjectFileNames();

    setBusy(
      true,
      "상품 페이지를 준비하고 있습니다",
      "자동으로 새로고침합니다. 잠시만 기다려주세요."
    );
    await reloadAndWaitForProductPage(captureTab.id);

    projectNameInput.disabled = true;
    pickRootButton.disabled = true;
    setupCard.hidden = true;
    productCard.hidden = false;
    captureCard.hidden = true;
    captureHelp.hidden = true;
    updateProductPhotoState();
    window.scrollTo({ top: 0, behavior: "auto" });
    setStatus("2단계입니다. 필요한 제품사진을 한 장씩 저장해주세요.", "success");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "캡처를 시작하지 못했습니다.", "error");
  } finally {
    setBusy(false);
    working = false;
    updateStartButton();
    updateProductPhotoState();
  }
}

function handleCaptureMessage(message, sender) {
  if (sender.tab?.id !== captureTab?.id || working) return;

  if (message?.type === "NG_CAPTURE_SELECTION_READY") {
    selection = message.selection;
    captureActions.querySelectorAll("button").forEach((button) => {
      button.disabled = false;
    });
    instruction.hidden = true;
    selectionSummary.hidden = false;
    captureActions.hidden = false;
    selectionSize.textContent = "선택한 범위를 그림 1장으로 저장합니다.";
    saveNumberedLabel.textContent = `${nextNumber}.jpg로 저장`;
    setStatus("범위를 확인하고 저장 버튼을 눌러주세요.");
    return;
  }

  if (message?.type === "NG_CAPTURE_PRODUCT_PHOTO_SELECTED") {
    void saveProductPhoto(message.photo);
  }
}

async function dataUrlToBitmap(dataUrl) {
  const response = await fetch(dataUrl);
  return createImageBitmap(await response.blob());
}

async function canvasToJpeg(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("그림 파일을 만들지 못했습니다.")),
      "image/jpeg",
      0.92
    );
  });
}

async function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("제품사진 파일을 만들지 못했습니다.")),
      "image/png"
    );
  });
}

async function normalizeProductPhoto(blob, sourceUrl) {
  const mimeType = (blob.type || "").toLowerCase().split(";")[0];
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    return { blob, extension: "jpg" };
  }
  if (mimeType === "image/png") {
    return { blob, extension: "png" };
  }

  const pathname = (() => {
    try {
      return new URL(sourceUrl).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (!mimeType && /\.jpe?g$/.test(pathname)) {
    return { blob, extension: "jpg" };
  }
  if (!mimeType && /\.png$/.test(pathname)) {
    return { blob, extension: "png" };
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { blob: await canvasToPng(canvas), extension: "png" };
}

async function prepareCaptureSlice(cursorY, rangeEndY) {
  for (let attempt = 0; attempt < CAPTURE_POSITION_RETRIES; attempt += 1) {
    await sendToProduct({
      type: "NG_CAPTURE_SCROLL_TO",
      y: cursorY
    });
    await sleep(CAPTURE_DELAY_MS);

    const metrics = await sendToProduct({ type: "NG_CAPTURE_MEASURE" });
    const contentHeight = Math.min(
      metrics.viewportHeight,
      Number.isFinite(metrics.contentHeight) && metrics.contentHeight > 1
        ? metrics.contentHeight
        : metrics.viewportHeight
    );
    const slice = calculateVisibleCaptureSlice({
      cursorY,
      rangeEndY,
      scrollY: metrics.scrollY,
      contentHeight
    });

    if (slice.height > 1) {
      return {
        metrics,
        cropTopCss: slice.cropTop,
        sliceCss: slice.height
      };
    }
  }

  throw new Error(
    "페이지 위치가 안정되지 않아 캡처하지 못했습니다. 잠시 후 다시 시도해주세요."
  );
}

async function captureRange(range) {
  let cursorY = range.startY;
  let canvas = null;
  let context = null;
  let scaleX = null;
  let scaleY = null;
  let outputWidth = null;
  let outputHeight = null;
  let safety = 0;

  while (hasRemainingCaptureArea({ cursorY, rangeEndY: range.endY })) {
    safety += 1;
    if (safety > 100) throw new Error("캡처 범위가 너무 깁니다.");

    const {
      metrics,
      cropTopCss,
      sliceCss
    } = await prepareCaptureSlice(cursorY, range.endY);

    const screenshot = await chrome.tabs.captureVisibleTab(
      captureTab.windowId,
      { format: "png" }
    );
    const bitmap = await dataUrlToBitmap(screenshot);

    const currentScaleX = bitmap.width / metrics.viewportWidth;
    const currentScaleY = bitmap.height / metrics.viewportHeight;

    if (!canvas) {
      scaleX = currentScaleX;
      scaleY = currentScaleY;
      outputWidth = Math.max(1, Math.round(metrics.detailWidth * scaleX));
      outputHeight = Math.max(
        1,
        Math.round((range.endY - range.startY) * scaleY)
      );

      if (
        outputHeight > MAX_OUTPUT_HEIGHT ||
        outputWidth * outputHeight > MAX_OUTPUT_PIXELS
      ) {
        throw new Error(
          "선택한 범위가 브라우저에서 한 장으로 만들 수 있는 최대 크기를 넘습니다. 범위를 두 번으로 나누어 선택해주세요."
        );
      }

      canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#fff";
      context.fillRect(0, 0, outputWidth, outputHeight);
    }

    const sourceX = Math.max(0, Math.round(metrics.detailLeft * currentScaleX));
    const sourceY = Math.max(0, Math.round(cropTopCss * currentScaleY));
    const sourceWidth = Math.min(
      bitmap.width - sourceX,
      Math.round(metrics.detailWidth * currentScaleX)
    );
    const sourceHeight = Math.min(
      bitmap.height - sourceY,
      Math.round(sliceCss * currentScaleY)
    );
    const destinationY = Math.round((cursorY - range.startY) * scaleY);
    const destinationHeight = Math.min(
      outputHeight - destinationY,
      Math.round(sliceCss * scaleY)
    );

    context.drawImage(
      bitmap,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      destinationY,
      outputWidth,
      destinationHeight
    );
    bitmap.close();
    cursorY += sliceCss;
  }

  return canvasToJpeg(canvas);
}

async function writeFile(fileName, blob) {
  const handle = await projectHandle.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
  projectFileNames.add(fileName);
}

async function saveSelection() {
  if (!selection || working) return;

  working = true;
  setBusy(
    true,
    "그림을 저장하고 있습니다",
    "페이지가 자동으로 움직여도 잠시 기다려주세요."
  );
  captureActions.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
  let originalScrollY = 0;
  let preparedForCapture = false;
  let savedName = "";

  try {
    const activeTab = await getActiveProductTab();
    if (activeTab.id !== captureTab.id) {
      throw new Error("캡처를 시작한 애터미 상품 페이지로 돌아가주세요.");
    }

    const prepared = await sendToProduct({ type: "NG_CAPTURE_PREPARE" });
    preparedForCapture = true;
    originalScrollY = prepared.originalScrollY;
    const range = normalizeSelectionRange(selection);
    const name = `${nextNumber}.jpg`;
    const blob = await captureRange(range);
    await writeFile(name, blob);

    savedName = name;
    nextNumber += 1;
    selection = null;
  } catch (error) {
    console.error(error);
    setStatus(error.message || "그림을 저장하지 못했습니다.", "error");
    captureActions.querySelectorAll("button").forEach((button) => {
      button.disabled = false;
    });
  } finally {
    if (preparedForCapture) {
      try {
        await sendToProduct({
          type: "NG_CAPTURE_FINISH",
          scrollY: originalScrollY
        });
      } catch (error) {
        console.error(error);
      }
    }
    setBusy(false);
    working = false;

    if (savedName) {
      await beginSelection({
        successMessage:
          `${savedName} 저장 완료! 이제 ${nextNumber}.jpg의 맨 위를 눌러주세요.`
      });
    }
  }
}

async function saveProductPhoto(photo) {
  if (!photo?.src || working) return;

  working = true;
  setBusy(
    true,
    "제품사진을 저장하고 있습니다",
    "원본 사진을 받아 알맞은 이름을 붙이고 있습니다."
  );
  pickProductButton.disabled = true;
  finishProductButton.disabled = true;

  try {
    const activeTab = await getActiveProductTab();
    if (activeTab.id !== captureTab.id) {
      throw new Error("캡처를 시작한 애터미 상품 페이지로 돌아가주세요.");
    }

    const response = await fetch(photo.src);
    if (!response.ok) {
      throw new Error(`제품사진을 받지 못했습니다. (${response.status})`);
    }

    const normalized = await normalizeProductPhoto(await response.blob(), photo.src);
    const name = nextProductPhotoName(projectFileNames, normalized.extension);
    await writeFile(name, normalized.blob);

    selection = null;
    updateProductPhotoState();
    setStatus(
      `${name} 저장 완료! 더 필요하면 ‘한 장 더 저장하기’를 눌러주세요.`,
      "success"
    );
  } catch (error) {
    console.error(error);
    setStatus(error.message || "제품사진을 저장하지 못했습니다.", "error");
  } finally {
    setBusy(false);
    pickProductButton.disabled = false;
    working = false;
    updateProductPhotoState();
  }
}

async function finishProductPhotoStep() {
  if (working || getProductPhotoNames(projectFileNames).length === 0) return;

  working = true;
  pickProductButton.disabled = true;
  finishProductButton.disabled = true;
  productCard.hidden = true;
  captureCard.hidden = false;
  captureHelp.hidden = false;
  window.scrollTo({ top: 0, behavior: "auto" });

  try {
    working = false;
    await beginSelection({
      scrollToDetail: true,
      successMessage:
        `3단계입니다. ${nextNumber}.jpg로 저장할 그림의 맨 위를 눌러주세요.`
    });
  } finally {
    working = false;
    pickProductButton.disabled = false;
    updateProductPhotoState();
  }
}

async function resetSelection() {
  try {
    await sendToProduct({ type: "NG_CAPTURE_RESET_SELECTION" });
    await beginSelection();
  } catch (error) {
    console.error(error);
    setStatus(error.message, "error");
  }
}

async function restoreRememberedRoot() {
  try {
    const remembered = await loadRootHandle();
    if (!remembered || remembered.name !== ROOT_FOLDER_NAME) {
      setRootReady(false, "교육 자료 폴더를 선택해주세요.");
      return;
    }

    if (await hasWritePermission(remembered, false)) {
      rootHandle = remembered;
      setRootReady(true, `선택됨: ${ROOT_FOLDER_NAME}`);
      return;
    }

    setRootReady(false, "교육 자료 폴더를 다시 확인해주세요.");
  } catch (error) {
    console.error(error);
    setRootReady(false, "교육 자료 폴더를 선택해주세요.");
  }
}

pickRootButton.addEventListener("click", pickRootFolder);
projectNameInput.addEventListener("input", updateStartButton);
startButton.addEventListener("click", startSession);
saveNumberedButton.addEventListener("click", saveSelection);
pickProductButton.addEventListener("click", beginProductPhotoSelection);
finishProductButton.addEventListener("click", finishProductPhotoStep);
selectAgainButton.addEventListener("click", resetSelection);
newSelectionButton.addEventListener("click", () => beginSelection());
chrome.runtime.onMessage.addListener(handleCaptureMessage);

await restoreRememberedRoot();
updateStartButton();
