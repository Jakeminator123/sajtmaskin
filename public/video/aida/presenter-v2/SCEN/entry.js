if (location.protocol === "file:") {
  document.querySelector("main").hidden = true;
  document.getElementById("file-launch").hidden = false;
} else {
  void import("./studio.js");
}
