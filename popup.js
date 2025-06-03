const btn = document.querySelector(".changeColorBtn");
const colorGrid = document.querySelector(".colorGrid");
const colorValue = document.querySelector(".colorValue");

let isColorPickingActive = false;

btn.addEventListener("click", async () => {
  if (isColorPickingActive) {
    console.log("Color picking already in progress, ignoring click");
    return;
  }
  try {
    isColorPickingActive = true;
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab) {
      throw new Error("No active tab found");
    }
    btn.textContent = "Click anywhere on the page...";
    btn.disabled = true;

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: cleanupExistingColorPicker,
      });
    } catch (cleanupError) {
      console.log(
        "Cleanup script execution failed (this is normal for first run)"
      );
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectColorPickerHandler,
    });

    const messageListener = (message, sender, sendResponse) => {
      if (message.type === "colorPicked") {
        const color = message.color;
        colorGrid.style.backgroundColor = color;
        colorValue.textContent = color;
        chrome.storage.local.set({
          lastPickedColor: color,
          lastPickedTime: Date.now(),
        });

        btn.textContent = "Color Picked!";
        btn.disabled = false;
        setTimeout(() => {
          btn.textContent = "Pick Color";
        }, 2000);

        isColorPickingActive = false;
        chrome.runtime.onMessage.removeListener(messageListener);
      } else if (message.type === "colorPickingFailed") {
        btn.textContent = "Pick Color";
        btn.disabled = false;
        showError(message.error || "Color picking failed");
        isColorPickingActive = false;
        chrome.runtime.onMessage.removeListener(messageListener);
      } else if (message.type === "colorPickingCancelled") {
        btn.textContent = "Pick Color";
        btn.disabled = false;

        isColorPickingActive = false;
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    setTimeout(() => {
      if (btn.disabled && isColorPickingActive) {
        btn.textContent = "Pick Color";
        btn.disabled = false;
        isColorPickingActive = false;
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    }, 30000); // 30 second timeout
  } catch (error) {
    console.error("Extension error:", error);
    btn.textContent = "Pick Color";
    btn.disabled = false;
    isColorPickingActive = false;
    showError("Failed to start color picker: " + error.message);
  }
});

function cleanupExistingColorPicker() {
  if (window.colorScoopHandler) {
    document.removeEventListener("click", window.colorScoopHandler, true);
    window.colorScoopHandler = null;
  }
  if (window.colorScoopEscHandler) {
    document.removeEventListener("keydown", window.colorScoopEscHandler);
    window.colorScoopEscHandler = null;
  }
  const existingIndicators = document.querySelectorAll("#colorscoop-indicator");
  existingIndicators.forEach((indicator) => {
    if (indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  });

  window.colorScoopActive = false;

  console.log("Cleaned up existing color picker processes");
}

function injectColorPickerHandler() {
  if (window.colorScoopActive) {
    console.log("Color picking already active, ignoring duplicate request");
    return;
  }

  window.colorScoopActive = true;

  function cleanupColorScoop() {
    if (window.colorScoopHandler) {
      document.removeEventListener("click", window.colorScoopHandler, true);
      window.colorScoopHandler = null;
    }
    if (window.colorScoopEscHandler) {
      document.removeEventListener("keydown", window.colorScoopEscHandler);
      window.colorScoopEscHandler = null;
    }
    const existingIndicators = document.querySelectorAll(
      "#colorscoop-indicator"
    );
    existingIndicators.forEach((indicator) => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    });

    window.colorScoopActive = false;
  }

  if (!window.EyeDropper) {
    cleanupColorScoop();
    chrome.runtime.sendMessage({
      type: "colorPickingFailed",
      error:
        "EyeDropper API not supported in this browser. Please use Chrome 95+ or Edge 95+",
    });
    return;
  }

  const indicator = document.createElement("div");
  indicator.id = "colorscoop-indicator";
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 25px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 13px;
    font-weight: 600;
    z-index: 2147483647;
    pointer-events: none;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    animation: slideInRight 0.3s ease-out;
    border: 2px solid rgba(255,255,255,0.3);
    max-width: 240px;
    text-align: center;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    line-height: 1.4;
  `;
  indicator.innerHTML = `
    Click anywhere to pick a color<br>
    <span style="font-size: 11px; opacity: 0.9;">Press ESC to cancel</span>
  `;

  if (!document.getElementById("colorscoop-styles")) {
    const style = document.createElement("style");
    style.id = "colorscoop-styles";
    style.textContent = `
      @keyframes slideInRight {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      @keyframes slideOutRight {
        from {
          opacity: 1;
          transform: translateX(0);
        }
        to {
          opacity: 0;
          transform: translateX(100%);
        }
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      @keyframes slideUp {
        from {
          transform: translateY(100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }
  const highZElements = Array.from(document.querySelectorAll("*")).filter(
    (el) => {
      const zIndex = parseInt(window.getComputedStyle(el).zIndex);
      return zIndex > 999999;
    }
  );

  if (highZElements.length > 0) {
    const maxZ = Math.max(
      ...highZElements.map((el) => parseInt(window.getComputedStyle(el).zIndex))
    );
    indicator.style.zIndex = (maxZ + 100).toString();
  }

  document.body.appendChild(indicator);
  setTimeout(() => {
    indicator.style.animation = "pulse 2s ease-in-out infinite";
  }, 300);
  window.colorScoopHandler = function (e) {
    e.preventDefault();
    e.stopPropagation();
    cleanupColorScoop();
    if (indicator && indicator.parentNode) {
      indicator.style.animation = "slideOutRight 0.3s ease-out";
      setTimeout(() => {
        if (indicator && indicator.parentNode) {
          indicator.parentNode.removeChild(indicator);
        }
      }, 300);
    }
    const eyeDropper = new EyeDropper();
    eyeDropper
      .open()
      .then((result) => {
        const color = result.sRGBHex;
        navigator.clipboard
          .writeText(color)
          .then(() => {
            showSuccessNotification(`Color ${color} copied to clipboard!`);
          })
          .catch(() => {
            try {
              const textArea = document.createElement("textarea");
              textArea.value = color;
              textArea.style.position = "fixed";
              textArea.style.opacity = "0";
              textArea.style.pointerEvents = "none";
              document.body.appendChild(textArea);
              textArea.select();
              textArea.setSelectionRange(0, 99999);
              document.execCommand("copy");
              document.body.removeChild(textArea);
              showSuccessNotification(`Color ${color} copied to clipboard!`);
            } catch (fallbackError) {
              showSuccessNotification(`Color picked: ${color}`);
            }
          });

        chrome.runtime.sendMessage({
          type: "colorPicked",
          color: color,
        });
      })
      .catch((error) => {
        if (error.name === "NotAllowedError") {
          chrome.runtime.sendMessage({
            type: "colorPickingCancelled",
          });
        } else {
          chrome.runtime.sendMessage({
            type: "colorPickingFailed",
            error: error.message,
          });
        }
      });
  };
  window.colorScoopEscHandler = function (e) {
    if (e.key === "Escape") {
      cleanupColorScoop();
      if (indicator && indicator.parentNode) {
        indicator.style.animation = "slideOutRight 0.3s ease-out";
        setTimeout(() => {
          if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
          }
        }, 300);
      }

      chrome.runtime.sendMessage({
        type: "colorPickingCancelled",
      });
    }
  };
  document.addEventListener("click", window.colorScoopHandler, true);
  document.addEventListener("keydown", window.colorScoopEscHandler);

  function showSuccessNotification(message) {
    const existing = document.querySelectorAll(
      ".colorscoop-success-notification"
    );
    existing.forEach((n) => n.remove());

    const notification = document.createElement("div");
    notification.className = "colorscoop-success-notification";
    notification.style.cssText = `
      position: fixed;
      bottom: 100px;
      right: 20px;
      background: linear-gradient(135deg, #4CAF50, #45a049);
      color: white;
      padding: 15px 25px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      font-size: 14px;
      font-weight: 600;
      z-index: 2147483647;
      box-shadow: 0 6px 20px rgba(0,0,0,0.3);
      animation: slideUp 0.4s ease-out;
      border: 2px solid rgba(255,255,255,0.3);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    `;

    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = "slideUp 0.4s ease-out reverse";
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 400);
      }
    }, 3000);
  }
}

function showError(message) {
  colorValue.textContent = message;
  colorValue.style.color = "#ff6b6b";
  setTimeout(() => {
    colorValue.textContent = "";
    colorValue.style.color = "";
  }, 4000);
}
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const result = await chrome.storage.local.get([
      "lastPickedColor",
      "lastPickedTime",
    ]);

    if (result.lastPickedColor) {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      if (!result.lastPickedTime || result.lastPickedTime > oneHourAgo) {
        colorGrid.style.backgroundColor = result.lastPickedColor;
        colorValue.textContent = result.lastPickedColor;
        colorValue.style.cursor = "pointer";
        colorValue.title = "Click to copy";
        colorValue.addEventListener("click", () => {
          navigator.clipboard.writeText(result.lastPickedColor).then(() => {
            const originalText = colorValue.textContent;
            colorValue.textContent = "Copied!";
            setTimeout(() => {
              colorValue.textContent = originalText;
            }, 1000);
          });
        });
      }
    }
  } catch (error) {
    console.log("No stored color found");
  }
});
