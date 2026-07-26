import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateVisibleCaptureSlice,
  findNextCaptureNumber,
  getProductPhotoNames,
  hasRemainingCaptureArea,
  hasProductPhoto,
  nextProductPhotoName,
  normalizeSelectionRange,
  validateProjectName
} from "../capture-core.mjs";

test("프로젝트 폴더 이름은 반드시 직접 입력해야 한다", () => {
  assert.equal(validateProjectName("").valid, false);
  assert.equal(validateProjectName("   ").valid, false);
  assert.deepEqual(validateProjectName("마이크로바이옴 KR"), {
    valid: true,
    value: "마이크로바이옴 KR",
    error: ""
  });
});

test("윈도우에서 위험한 폴더 이름을 막는다", () => {
  assert.equal(validateProjectName("마이크로:바이옴").valid, false);
  assert.equal(validateProjectName("CON").valid, false);
  assert.equal(validateProjectName("끝.").valid, false);
});

test("선택 방향과 길이에 관계없이 한 범위로 정리한다", () => {
  assert.deepEqual(
    normalizeSelectionRange({ startY: 100, endY: 3300 }),
    { startY: 100, endY: 3300 }
  );

  assert.deepEqual(
    normalizeSelectionRange({ startY: 3300, endY: 100 }),
    { startY: 100, endY: 3300 }
  );
});

test("마지막 1픽셀 이하의 잔여 범위는 캡처 완료로 처리한다", () => {
  assert.equal(
    hasRemainingCaptureArea({ cursorY: 2099.4, rangeEndY: 2100 }),
    false
  );
  assert.equal(
    hasRemainingCaptureArea({ cursorY: 2098.9, rangeEndY: 2100 }),
    true
  );
});

test("브라우저 창 크기마다 실제 글자 영역만 캡처한다", () => {
  assert.deepEqual(
    calculateVisibleCaptureSlice({
      cursorY: 100,
      rangeEndY: 2100,
      scrollY: 100,
      contentHeight: 808
    }),
    { cropTop: 0, height: 808 }
  );
  assert.deepEqual(
    calculateVisibleCaptureSlice({
      cursorY: 100,
      rangeEndY: 2100,
      scrollY: 100,
      contentHeight: 600
    }),
    { cropTop: 0, height: 600 }
  );
});

test("스크롤이 끝난 실제 위치를 기준으로 화면 조각을 자른다", () => {
  assert.deepEqual(
    calculateVisibleCaptureSlice({
      cursorY: 908,
      rangeEndY: 2100,
      scrollY: 900,
      contentHeight: 808
    }),
    { cropTop: 8, height: 800 }
  );
});

test("기존 숫자 파일 다음 번호부터 이어서 저장한다", () => {
  assert.equal(findNextCaptureNumber([]), 1);
  assert.equal(
    findNextCaptureNumber(["1.jpg", "2.jpg", "3-1.jpg", "3-2.jpg", "제품사진.jpg"]),
    4
  );
});

test("제품사진이 이미 있으면 덮어쓰지 않는다", () => {
  assert.equal(hasProductPhoto([]), false);
  assert.equal(hasProductPhoto(["1.jpg", "제품사진.png"]), true);
  assert.equal(hasProductPhoto(["제품사진-2.jpg"]), true);
  assert.deepEqual(
    getProductPhotoNames([
      "제품사진-3.png",
      "1.jpg",
      "제품사진.jpg",
      "제품사진-2.jpg"
    ]),
    ["제품사진.jpg", "제품사진-2.jpg", "제품사진-3.png"]
  );
  assert.equal(nextProductPhotoName([]), "제품사진.jpg");
  assert.equal(nextProductPhotoName([], "png"), "제품사진.png");
  assert.equal(
    nextProductPhotoName(["제품사진.jpg", "제품사진-2.png"]),
    "제품사진-3.jpg"
  );
  assert.equal(
    nextProductPhotoName(["제품사진.png"], "png"),
    "제품사진-2.png"
  );
});
