"use strict";
const $ = selector => document.querySelector(selector);
const files = $("#files");
const folderFiles = $("#folder-files");
const upload = $("#upload");
const grid = $("#grid");
const empty = $("#empty");
const count = $("#count");
const sortBtn = $("#sort");
const clearBtn = $("#clear");
const pdfBtn = $("#pdf");
const presentBtn = $("#present");
const status = $("#status");
const busy = $("#busy");
const show = $("#show");
const pimage = $("#pimage");
const textSorter = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
let images = [];
let dragged = null;
let current = 0;
let showing = false;
let closing = false;
const makeId = () => crypto.randomUUID
? crypto.randomUUID()
: `${Date.now()}-${Math.random()}`;
const supported = file =>
/image\/(png|jpeg)/.test(file.type) || /\.(png|jpe?g)$/i.test(file.name);
const message = (text = "", kind = "") => {
status.textContent = text;
status.dataset.kind = kind;
};
const rootFolder = file => {
const path = file.webkitRelativePath || "";
return path.includes("/") ? path.split("/")[0] : "";
};
const numberParts = filename => {
const base = filename.replace(/\.[^.]+$/, "");
return (base.match(/\d+/g) || []).map(Number);
};
const compareNumberedNames = (a, b) => {
const aParts = numberParts(a.file.name);
const bParts = numberParts(b.file.name);
if (aParts.length && bParts.length) {
const length = Math.max(aParts.length, bParts.length);
for (let i = 0; i < length; i += 1) {
if (i >= aParts.length) return -1;
if (i >= bParts.length) return 1;
if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
}
} else if (aParts.length) {
return -1;
} else if (bParts.length) {
return 1;
}
return textSorter.compare(a.file.name, b.file.name);
};
const naturalSort = () => images.sort(compareNumberedNames);
const commonFolderName = () => {
if (!images.length) return "";
const folder = images[0].folder;
if (!folder || images.some(image => image.folder !== folder)) return "";
return folder;
};
const safeFilename = name => {
const safe = name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/[. ]+$/g, "").trim();
return safe || "교육자료";
};
const pdfFilename = () => `${safeFilename(commonFolderName() || "교육자료")}.pdf`;
function add(list) {
const all = [...list];
const ok = all.filter(supported);
const bad = all.length - ok.length;
ok.forEach(file => images.push({
id: makeId(),
file,
folder: rootFolder(file),
url: URL.createObjectURL(file)
}));
if (ok.length) {
naturalSort();
const folder = commonFolderName();
const note = folder ? ` PDF는 ${safeFilename(folder)}.pdf로 저장됩니다.` : "";
message(`${ok.length}장의 그림을 추가했습니다.${note}`, "success");
}
if (bad) {
message(`PNG 또는 JPG가 아닌 파일 ${bad}개는 제외했습니다.`, "error");
}
files.value = "";
folderFiles.value = "";
render();
}
function move(item, by) {
const i = images.findIndex(image => image.id === item);
const j = i + by;
if (i < 0 || j < 0 || j >= images.length) return;
[images[i], images[j]] = [images[j], images[i]];
message("그림 순서를 바꿨습니다.", "success");
render();
}
function moveTo(from, to) {
if (!from || from === to) return;
const i = images.findIndex(image => image.id === from);
const j = images.findIndex(image => image.id === to);
if (i < 0 || j < 0) return;
images.splice(j, 0, images.splice(i, 1)[0]);
message("그림 순서를 바꿨습니다.", "success");
render();
}
function remove(item) {
const i = images.findIndex(image => image.id === item);
if (i < 0) return;
URL.revokeObjectURL(images[i].url);
images.splice(i, 1);
message("그림 한 장을 지웠습니다.", "success");
render();
}
function clearAll() {
images.forEach(image => URL.revokeObjectURL(image.url));
images = [];
message("모든 그림을 지웠습니다.", "success");
render();
}
const icon = path => {
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
const line = document.createElementNS(svg.namespaceURI, "path");
svg.setAttribute("viewBox", "0 0 24 24");
line.setAttribute("d", path);
svg.append(line);
return svg;
};
function moveButton(label, path, disabled, fn) {
const button = document.createElement("button");
button.className = "move";
button.disabled = disabled;
button.setAttribute("aria-label", label);
button.append(icon(path), label);
button.onclick = fn;
return button;
}
function render() {
const hasImages = images.length > 0;
count.textContent = `${images.length}장`;
empty.hidden = hasImages;
grid.hidden = !hasImages;
sortBtn.disabled = images.length < 2;
clearBtn.disabled = !hasImages;
pdfBtn.disabled = !hasImages;
presentBtn.disabled = !hasImages;
grid.replaceChildren();
images.forEach((image, index) => {
const card = document.createElement("article");
card.className = "thumb";
card.draggable = true;
const pic = document.createElement("div");
pic.className = "pic";
const preview = new Image();
preview.src = image.url;
preview.alt = `${index + 1}번째 그림: ${image.file.name}`;
const num = document.createElement("span");
num.className = "num";
num.textContent = index + 1;
pic.append(preview, num);
const info = document.createElement("div");
info.className = "info";
const text = document.createElement("div");
const name = document.createElement("p");
const hint = document.createElement("p");
name.className = "name";
name.textContent = image.file.name;
name.title = image.file.name;
hint.className = "hint";
hint.textContent = "끌어서 옮길 수도 있습니다.";
text.append(name, hint);
const moves = document.createElement("div");
moves.className = "moves";
const del = moveButton("삭제", "M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13", false, () => remove(image.id));
del.classList.add("delete");
moves.append(
moveButton("앞으로", "m15 5-7 7 7 7", index === 0, () => move(image.id, -1)),
moveButton("뒤로", "m9 5 7 7-7 7", index === images.length - 1, () => move(image.id, 1)),
del
);
info.append(text, moves);
card.append(pic, info);
card.ondragstart = () => {
dragged = image.id;
card.classList.add("dragging");
};
card.ondragend = () => {
dragged = null;
card.classList.remove("dragging");
document.querySelectorAll(".target").forEach(element => element.classList.remove("target"));
};
card.ondragover = event => {
event.preventDefault();
if (dragged && dragged !== image.id) card.classList.add("target");
};
card.ondragleave = () => card.classList.remove("target");
card.ondrop = event => {
event.preventDefault();
card.classList.remove("target");
moveTo(dragged, image.id);
};
grid.append(card);
});
}
async function makePdf() {
if (!images.length) return;
busy.classList.add("open");
message();
pdfBtn.disabled = true;
presentBtn.disabled = true;
try {
if (!window.PDFLib) throw Error("library");
const doc = await PDFLib.PDFDocument.create();
for (const imageFile of images) {
const bytes = await imageFile.file.arrayBuffer();
const isPng = imageFile.file.type === "image/png" || /\.png$/i.test(imageFile.file.name);
const embedded = isPng
? await doc.embedPng(bytes)
: await doc.embedJpg(bytes);
const page = doc.addPage([embedded.width, embedded.height]);
page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
}
const filename = pdfFilename();
const blob = new Blob([await doc.save()], { type: "application/pdf" });
const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = filename;
document.body.append(link);
link.click();
link.remove();
setTimeout(() => URL.revokeObjectURL(url), 30000);
message(`그림 ${images.length}장을 ${filename}로 저장했습니다.`, "success");
} catch (error) {
console.error(error);
message("PDF를 만들지 못했습니다. 인터넷 연결을 확인한 뒤 다시 눌러주세요.", "error");
} finally {
busy.classList.remove("open");
pdfBtn.disabled = !images.length;
presentBtn.disabled = !images.length;
}
}
function updateShow() {
if (!showing || !images.length) return;
current = Math.max(0, Math.min(current, images.length - 1));
pimage.src = images[current].url;
if (images[current + 1]) new Image().src = images[current + 1].url;
}
async function startShow() {
if (!images.length) return;
current = 0;
showing = true;
closing = false;
show.classList.add("open");
show.setAttribute("aria-hidden", "false");
document.body.style.overflow = "hidden";
updateShow();
try {
if (show.requestFullscreen) await show.requestFullscreen();
} catch (error) {
console.info(error);
}
}
function finishShow() {
showing = false;
show.classList.remove("open");
show.setAttribute("aria-hidden", "true");
pimage.removeAttribute("src");
document.body.style.overflow = "";
}
async function closeShow() {
if (!showing) return;
closing = true;
finishShow();
if (document.fullscreenElement && document.exitFullscreen) {
try {
await document.exitFullscreen();
} catch (error) {
console.info(error);
}
}
closing = false;
}
files.onchange = event => add(event.target.files);
folderFiles.onchange = event => add(event.target.files);
["dragenter", "dragover"].forEach(name => upload.addEventListener(name, event => {
event.preventDefault();
upload.classList.add("drag");
}));
["dragleave", "drop"].forEach(name => upload.addEventListener(name, event => {
event.preventDefault();
upload.classList.remove("drag");
}));
upload.ondrop = event => add(event.dataTransfer.files);
sortBtn.onclick = () => {
naturalSort();
message("1, 1-5, 2, 3, 3.5처럼 숫자 순서로 정렬했습니다.", "success");
render();
};
clearBtn.onclick = clearAll;
pdfBtn.onclick = makePdf;
presentBtn.onclick = startShow;
document.onkeydown = event => {
if (!showing) return;
if (event.key === "ArrowLeft" || event.key === "PageUp") {
event.preventDefault();
if (current > 0) {
current -= 1;
updateShow();
}
} else if (["ArrowRight", "PageDown", " ", "Enter"].includes(event.key)) {
event.preventDefault();
if (current < images.length - 1) {
current += 1;
updateShow();
}
} else if (event.key === "Escape" && !document.fullscreenElement) {
closeShow();
}
};
document.onfullscreenchange = () => {
if (!document.fullscreenElement && showing && !closing) finishShow();
};
window.onbeforeunload = () => images.forEach(image => URL.revokeObjectURL(image.url));
render();
