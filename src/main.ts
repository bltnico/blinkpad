import "microtip/microtip.css";
import "./styles/app.css";
import "./styles/sheet.css";
import "./app";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}
