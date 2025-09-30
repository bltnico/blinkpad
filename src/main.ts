import "microtip/microtip.css";
import "./style.css";
import "./app";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js");
  });
}
