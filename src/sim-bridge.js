const vscode = acquireVsCodeApi();

const previousState = vscode.getState();
if (previousState && previousState.content)
  window.codeMirror.setValue(previousState.content);

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
