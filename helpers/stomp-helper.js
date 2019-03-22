(function (exports) {
  exports.processFrame = (data) => {
    const lines = data.split("\n");
    const frame = {};
    frame["headers"] = {};
    if (lines.length > 1) {
      frame["command"] = lines[0];
      let i = 1;
      while (lines[i].length > 0) {
        const headerSplit = lines[i].split(":");
        const key = headerSplit[0].trim();
        const val = headerSplit[1].trim();
        frame["headers"][key] = val;
        i++;
      }
      frame["content"] = lines
        .splice(i + 1, lines.length - i)
        .join("\n");
      frame["content"] = frame["content"]
        .substr(0, frame["content"].length - 1);
    }
    return frame;
  };

  exports.sendFrame = (ws, frame) => {
    const data = frame["command"] + "\n";
    const headerContent = "";
    Object.keys(frame)
      .forEach(key =>
        headerContent += key + ": " + frame["headers"][key] + "\n");
    data += headerContent + "\n\n" + frame["content"] + "\n\0";
    ws.send(data);
  };

  exports.sendError = (ws, msg, detail) => {
    const headers = {};
    if (msg) headers["message"] = msg;
    else headers["message"] = "No error message given.";

    exports.sendFrame(ws, {
      "command": "ERROR",
      "headers": headers,
      "content": detail
    });
  };
})(typeof exports === "undefined" ? this["Stomp"] = {} : exports);