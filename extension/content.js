"use strict";

(() => {
  const DETAIL_SELECTOR = ".product-detail-info";
  const BANNER_ID = "ngpresent-capture-banner";
  const START_LINE_ID = "ngpresent-capture-start-line";
  const END_LINE_ID = "ngpresent-capture-end-line";
  const SHADE_ID = "ngpresent-capture-shade";
  const CURSOR_ID = "ngpresent-capture-cursor";
  const CAPTURING_CLASS = "ngpresent-capturing";

  let phase = "idle";
  let startY = null;
  let endY = null;
  let originalScrollY = 0;
  let hiddenFixedElements = [];
  let markedProductImages = [];

  const sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

  const detailElement = () => document.querySelector(DETAIL_SELECTOR);

  const detailBounds = () => {
    const detail = detailElement();
    if (!detail) return null;
    const rect = detail.getBoundingClientRect();
    return {
      left: rect.left + window.scrollX,
      right: rect.right + window.scrollX,
      top: rect.top + window.scrollY,
      bottom: rect.bottom + window.scrollY,
      width: rect.width,
      height: rect.height
    };
  };

  const removeElement = (id) => document.getElementById(id)?.remove();

  const clearMarkers = () => {
    removeElement(START_LINE_ID);
    removeElement(END_LINE_ID);
    removeElement(SHADE_ID);
  };

  const hideCaptureCursor = () => removeElement(CURSOR_ID);

  const moveCaptureCursor = (event) => {
    if (phase === "idle") return;

    let cursor = document.getElementById(CURSOR_ID);
    if (!cursor) {
      cursor = document.createElement("div");
      cursor.id = CURSOR_ID;
      document.body.append(cursor);
    }
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
  };

  const setBanner = (text) => {
    let banner = document.getElementById(BANNER_ID);
    if (!banner) {
      banner = document.createElement("div");
      banner.id = BANNER_ID;
      document.body.append(banner);
    }
    banner.textContent = text;
  };

  const drawLine = (id, y, bounds) => {
    let line = document.getElementById(id);
    if (!line) {
      line = document.createElement("div");
      line.id = id;
      line.className = "ngpresent-capture-line";
      document.body.append(line);
    }
    line.style.left = `${bounds.left}px`;
    line.style.top = `${y}px`;
    line.style.width = `${bounds.width}px`;
  };

  const drawSelection = (bounds) => {
    drawLine(START_LINE_ID, startY, bounds);
    drawLine(END_LINE_ID, endY, bounds);

    let shade = document.getElementById(SHADE_ID);
    if (!shade) {
      shade = document.createElement("div");
      shade.id = SHADE_ID;
      document.body.append(shade);
    }
    shade.style.left = `${bounds.left}px`;
    shade.style.top = `${startY}px`;
    shade.style.width = `${bounds.width}px`;
    shade.style.height = `${endY - startY}px`;
  };

  const visible = (element) => {
    if (!element) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number.parseFloat(style.opacity || "1") > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  };

  const eligibleProductImage = (image) => {
    if (!(image instanceof HTMLImageElement)) return false;
    if (image.closest(DETAIL_SELECTOR) || !visible(image)) return false;

    const rect = image.getBoundingClientRect();
    return (
      rect.width >= 220 &&
      rect.height >= 220 &&
      image.naturalWidth >= 500 &&
      image.naturalHeight >= 500
    );
  };

  const findMainProductImage = () =>
    [...document.images]
      .filter(eligibleProductImage)
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
      })[0] || null;

  async function expandProductDetail() {
    const expandButton = [...document.querySelectorAll("button")]
      .find((button) =>
        button.textContent.trim() === "상품상세 펼치기" && visible(button)
      );

    if (expandButton) {
      expandButton.click();
      await sleep(350);
    }

    const detail = detailElement();
    if (!detail) throw new Error("상품 상세 영역을 찾지 못했습니다.");
    return detail;
  }

  async function beginSelection(scrollToDetail = false) {
    stopSelection();
    clearMarkers();
    const detail = await expandProductDetail();
    if (scrollToDetail) {
      detail.scrollIntoView({ block: "start", behavior: "smooth" });
      await sleep(450);
    }

    phase = "start";
    startY = null;
    endY = null;
    document.documentElement.classList.add("ngpresent-picking");
    setBanner("저장할 그림의 맨 위를 한 번 눌러주세요");
  }

  async function beginProductPhotoSelection() {
    stopSelection();
    clearMarkers();
    phase = "product";
    document.documentElement.classList.add("ngpresent-product-picking");
    setBanner("저장할 제품사진을 한 번 눌러주세요");

    markedProductImages = [...document.images].filter(eligibleProductImage);
    markedProductImages.forEach((image) => {
      image.classList.add("ngpresent-product-photo-option");
    });
    const image = findMainProductImage();
    if (image) {
      image.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      await sleep(450);
    }
  }

  function stopSelection() {
    phase = "idle";
    document.documentElement.classList.remove("ngpresent-picking");
    document.documentElement.classList.remove("ngpresent-product-picking");
    markedProductImages.forEach((image) => {
      image.classList.remove("ngpresent-product-photo-option");
    });
    markedProductImages = [];
    hideCaptureCursor();
    removeElement(BANNER_ID);
  }

  function handlePick(event) {
    if (phase === "product") {
      const pathImage = event.composedPath()
        .find((element) => element instanceof HTMLImageElement);
      const pointImage = document.elementsFromPoint(event.clientX, event.clientY)
        .find((element) => element instanceof HTMLImageElement);
      const image = pathImage || pointImage;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (!eligibleProductImage(image)) {
        setBanner("위쪽의 큰 제품사진을 눌러주세요");
        return;
      }

      const source = image.currentSrc || image.src;
      stopSelection();
      void chrome.runtime.sendMessage({
        type: "NG_CAPTURE_PRODUCT_PHOTO_SELECTED",
        photo: {
          src: source,
          alt: image.alt || ""
        }
      }).catch(() => undefined);
      return;
    }

    if (phase !== "start" && phase !== "end") return;

    const bounds = detailBounds();
    if (!bounds) return;

    const pageX = event.clientX + window.scrollX;
    const pageY = event.clientY + window.scrollY;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (
      pageX < bounds.left ||
      pageX > bounds.right ||
      pageY < bounds.top ||
      pageY > bounds.bottom
    ) {
      setBanner("가운데 상품 설명 안을 눌러주세요");
      return;
    }

    if (phase === "start") {
      startY = Math.round(pageY);
      drawLine(START_LINE_ID, startY, bounds);
      phase = "end";
      setBanner("아래로 내려서 그림의 맨 아래를 눌러주세요");
      return;
    }

    if (pageY <= startY + 80) {
      setBanner("첫 번째 선보다 더 아래를 눌러주세요");
      return;
    }

    endY = Math.round(pageY);
    drawSelection(bounds);
    stopSelection();

    chrome.runtime.sendMessage({
      type: "NG_CAPTURE_SELECTION_READY",
      selection: {
        startY,
        endY,
        detailWidth: bounds.width
      }
    });
  }

  function hideFixedElements() {
    hiddenFixedElements = [];
    const elements = [...document.body.querySelectorAll("*")];

    for (const element of elements) {
      if (
        element.id === BANNER_ID ||
        element.id === START_LINE_ID ||
        element.id === END_LINE_ID ||
        element.id === SHADE_ID
      ) continue;

      const position = getComputedStyle(element).position;
      if (position !== "fixed" && position !== "sticky") continue;

      hiddenFixedElements.push({
        element,
        visibility: element.style.visibility
      });
      element.style.visibility = "hidden";
    }
  }

  function restoreFixedElements() {
    for (const item of hiddenFixedElements) {
      item.element.style.visibility = item.visibility;
    }
    hiddenFixedElements = [];
  }

  async function waitForVisibleImages() {
    const images = [...document.images].filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });

    await Promise.race([
      Promise.all(images.map((image) =>
        image.complete
          ? Promise.resolve()
          : image.decode().catch(() => undefined)
      )),
      sleep(900)
    ]);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
  }

  function captureMetrics() {
    const bounds = detailBounds();
    if (!bounds) throw new Error("상품 상세 영역을 찾지 못했습니다.");

    const documentHeight = document.documentElement.clientHeight;
    const contentHeight =
      Number.isFinite(documentHeight) && documentHeight > 1
        ? Math.min(window.innerHeight, documentHeight)
        : window.innerHeight;

    return {
      scrollY: window.scrollY,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      contentHeight,
      detailLeft: bounds.left - window.scrollX,
      detailWidth: bounds.width
    };
  }

  async function scrollForCapture(y) {
    window.scrollTo({ top: Math.round(y), left: 0, behavior: "auto" });
    await waitForVisibleImages();
    return captureMetrics();
  }

  window.addEventListener("click", handlePick, true);
  window.addEventListener("pointermove", moveCaptureCursor, {
    capture: true,
    passive: true
  });
  document.addEventListener("mouseleave", hideCaptureCursor);
  window.addEventListener("blur", hideCaptureCursor);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "NG_CAPTURE_PING") {
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "NG_CAPTURE_BEGIN_PRODUCT_PHOTO") {
      beginProductPhotoSelection()
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "NG_CAPTURE_BEGIN_SELECTION") {
      beginSelection(Boolean(message.scrollToDetail))
        .then(() => sendResponse({ ok: true }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "NG_CAPTURE_RESET_SELECTION") {
      stopSelection();
      clearMarkers();
      sendResponse({ ok: true });
      return false;
    }

    if (message?.type === "NG_CAPTURE_PREPARE") {
      originalScrollY = window.scrollY;
      stopSelection();
      clearMarkers();
      document.documentElement.classList.add(CAPTURING_CLASS);
      hideFixedElements();
      sendResponse({ ok: true, originalScrollY });
      return false;
    }

    if (message?.type === "NG_CAPTURE_SCROLL_TO") {
      scrollForCapture(message.y)
        .then((metrics) => sendResponse({ ok: true, ...metrics }))
        .catch((error) => sendResponse({ ok: false, error: error.message }));
      return true;
    }

    if (message?.type === "NG_CAPTURE_MEASURE") {
      try {
        sendResponse({ ok: true, ...captureMetrics() });
      } catch (error) {
        sendResponse({ ok: false, error: error.message });
      }
      return false;
    }

    if (message?.type === "NG_CAPTURE_FINISH") {
      restoreFixedElements();
      document.documentElement.classList.remove(CAPTURING_CLASS);
      window.scrollTo({ top: message.scrollY ?? originalScrollY, behavior: "auto" });
      sendResponse({ ok: true });
      return false;
    }

    return false;
  });
})();
