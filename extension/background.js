"use strict";

const useExplicitActionClick = () =>
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
    .catch((error) => console.error("옆 패널 설정을 바꾸지 못했습니다.", error));

useExplicitActionClick();
chrome.runtime.onInstalled.addListener(useExplicitActionClick);
chrome.runtime.onStartup.addListener(useExplicitActionClick);

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error("옆 패널을 열지 못했습니다.", error);
  }
});
