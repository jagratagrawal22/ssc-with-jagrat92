(function () {
  var STORAGE_KEY = "tgPopupDismissed";
  var SHOW_DELAY_MS = 1200;

  function alreadyDismissed() {
    try { return sessionStorage.getItem(STORAGE_KEY) === "1"; } catch (e) { return false; }
  }
  function markDismissed() {
    try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", function () {
    var overlay = document.getElementById("telegramModal");
    if (!overlay || alreadyDismissed()) return;

    var closeBtn = document.getElementById("tgClose");
    var laterBtn = document.getElementById("tgMaybeLater");
    var joinBtn = document.getElementById("tgJoinBtn");

    function close() {
      overlay.classList.add("hidden");
      markDismissed();
    }

    setTimeout(function () {
      overlay.classList.remove("hidden");
    }, SHOW_DELAY_MS);

    closeBtn.addEventListener("click", close);
    laterBtn.addEventListener("click", close);
    joinBtn.addEventListener("click", function () { markDismissed(); });
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.classList.contains("hidden")) close();
    });
  });
})();
