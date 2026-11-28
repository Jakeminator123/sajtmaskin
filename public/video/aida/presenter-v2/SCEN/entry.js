if (location.protocol === "file:") {
  document.querySelector("main").hidden = true;
  document.getElementById("file-launch").hidden = false;
} else {
  const studio = document.createElement("script");
  studio.src = document.currentScript.dataset.studio;
  document.body.append(studio);
}
