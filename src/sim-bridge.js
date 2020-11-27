const vscode = acquireVsCodeApi();

const previousState = vscode.getState();
if (previousState && previousState.content)
  window.codeMirror.setValue(previousState.content);

const btn = document.createElement("button");
btn.innerText = "Toggle Memory";
btn.addEventListener("click", () => {
  const x = document.getElementById("simMemory");
  if (x.style.display === "none") x.style.display = "inline-flex";
  else x.style.display = "none";
});
document.getElementById("simButtons").appendChild(btn);

window.addEventListener("message", (event) => {
  const message = event.data; // The JSON data our extension sent

  switch (message.command) {
    case "update-code":
      const { content } = message;
      window.codeMirror.setValue(content);
      vscode.setState({ content });
      break;
  }
});
