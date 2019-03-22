const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;
const wss = new WebSocketServer({
  port: 8181,
  handleProtocols: (protocol, cb) => {
    const v10Stomp = protocol[protocol.indexOf("v10.stomp")];
    if (v10Stomp) {
      cb(true, v10Stomp);
      return;
    }
    cb(false);
  }
});
const uuid = require('node-uuid');
const Stomp = require('../helpers/stomp-helper');
const amqp = require('amqp');
const connection = amqp.createConnection({
  host: "localhost",
  login: "websockets",
  password: "rabbitmq"
});

const stocks = {};

connection.on("ready", () => {
  connection.queue("stocks.result",
    { autoDelete: false, durable: true },
    q => {
      const data;
      try {
        data = JSON.parse(message.data.toString('utf8'));
      } catch (err) {
        console.log(err);
      }
      data.forEach(item => {
        Object.keys(stocks).forEach(client => {
          const ws = stocks[client].ws;
          Object.keys(stocks[client]).forEach(symbol => {
            if (symbol === item["symbol"]) {
              stocks[client][symbol] = item["price"];
              const price = parseFloat(stocks[client][symbol]);
              Stomp.send_frame(ws, {
                "command": "MESSAGE",
                "headers": {
                  "destination": "/queue/stocks." + symbol
                },
                content: JSON.stringify({ price })
              });
            }
          });
        });
      });
    });
});

const updater = setInterval(() => {
  const st = [];
  Object.keys(stocks).forEach(client =>
    Object.keys(stocks[client]).forEach(symbol =>
      symbol !== "ws" && st.push(symbol)));

  if (st.length > 0)
    connection.publish("stocks.work",
      JSON.stringify({ stocks: st }),
      { deliveryMode: 2 });

}, 10000);

const connectedSessions = [];

wss.on("connection", ws => {
  const sessionId = uuid.v4();

  stocks[sessionId] = {};
  connectedSessions.push(ws);
  stocks[sessionId]["ws"] = ws;

  ws.on("message", msg => {
    const frame = Stomp.processFrame(msg);
    const headers = frame["headers"];
    switch (frame["command"]) {
      case "CONNECT":
        Stomp.sendFrame(ws, {
          command: "CONNECTED",
          headers: {
            session: sessionId
          },
          content: ""
        });
        break;
      case "SUBSCRIBE":
        const subscribeSymbol = symbolFromDestination(frame["headers"]["destination"]);
        stocks[sessionId][subscribeSymbol] = 0;
        break;
      case "UNSUBSCRIBE":
        const unsubscribeSymbol = symbolFromDestination(frame["headers"]["destination"]);
        delete stocks[sessionId][unsubscribeSymbol];
        break;
      case "DISCONNECT":
        console.log("Disconnecting");
        closeSocket();
        break;
      default:
        Stomp.sendError(ws, "No valid command frame");
        break;
    }
  });

  const symbolFromDestination = destination => 
    destination.substring(destination.indexOf(".") + 1, destination.length);

  const closeSocket = () => {
    ws.close();
    if(stocks[sessionId] && stocks[sessionId]["ws"])
      stocks[sessionId]["ws"] = null;
    delete stocks[sessionId];
  };

  ws.on("close", () => closeSocket());

  process.on("SIGINT", () => {
    console.log("Closing via break");
    closeSocket();
    process.exit();
  });
});