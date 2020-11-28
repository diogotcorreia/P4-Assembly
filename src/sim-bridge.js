const vscode = acquireVsCodeApi();

const previousState = vscode.getState();
if (previousState && previousState.content)
  window.codeMirror.setValue(previousState.content);


const btn_togcode = document.createElement("button");


btn_togcode.innerText = "Toggle Code";
btn_togcode.addEventListener("click", () => {
  const x = document.getElementById("bodyContainer");
  if (x.style.display === "none") x.style.display = "flex";
  else x.style.display = "none";
});

document.getElementById("simButtons").appendChild(btn_togcode);

const btn_togmem = document.createElement("button");
btn_togmem.innerText = "Toggle Memory";
btn_togmem.addEventListener("click", () => {
  const x = document.getElementById("simMemory");
  if (x.style.display === "none") x.style.display = "inline-flex";
  else x.style.display = "none";
});

document.getElementById("simButtons").appendChild(btn_togmem);

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
