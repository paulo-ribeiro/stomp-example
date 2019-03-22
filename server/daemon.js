const request = require('request'),
  amqp = require('amqp');

class Stocks {
  lookupByArray(stocks, cb) {
    const csvStocks = `"${stocks.join('","')}"`;

    const envUrl = "&env=http%3A%2F%2Fdatatables.org%2Falltables.env&format=json";
    const url = "https://query.yahooapis.com/v1/public/yql";
    const data = encodeURIComponent(`select * from yahoo.finances.quotes where symbol in (${csvStocks})`);
    const dataUrl = url + "?q=" + data + envUrl;

    request.get({ url: dataUrl, json: true }, (err, resp, body) => {
      const stocksResult = [];
      if (!err && resp.statusCode == 200) {
        const stocks = body.query.results.quote;
        stocks.forEach(stock => stocks.push({
          symbol: stock.symbol,
          price: stock.Ask
        }));
        cb(stocksResult);
      } else {
        console.log(err);
      }
    });
  }
}

module.exports = Stocks;

const main = () => {
  const connection = amqp.createConnection({
    host: "localhost",
    login: "websockets",
    password: "rabbitmq"
  });

  const stocks = new Stocks();
  connection.on("ready", () => {
    connection.queue("stocks.work",
      { autoDelete: false, durable: true },
      q => {
        q.subscribe(msg => {
          const jsonData = msg.data.toString('utf8');
          const data;
          console.log(jsonData);
          try {
            data = JSON.parse(jsonData);
          } catch (err) {
            console.log(err);
          }
          stocks.lookupByArray(data.stocks, stocksRet => {
            const dataStr = JSON.stringify(stocksRet);
            connection.publish("stocks.result", dataStr, { deliveryMode: 2 });
          });
        });
      });
  });
};

if(require.main === module)
  main();