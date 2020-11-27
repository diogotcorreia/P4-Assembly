window.addEventListener("message", (event) => {
  const message = event.data; // The JSON data our extension sent

  switch (message.command) {
    case "update-code":
      const { content } = message;
      window.codeMirror.setValue(content);
      break;
  }
});
