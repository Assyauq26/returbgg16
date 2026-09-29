# Apps Script API

POST JSON to Web App URL.

```json
{"action":"getSellers"}
{"action":"addSeller","name":"Seller A"}
{"action":"saveReturns","sellerName":"Seller A","awbs":["ABC123","ABC124"]}
{"action":"searchReturns","q":"ABC","sellerName":"Seller A"}
```

Responses use `{"ok":true,"data":...}` or `{"ok":false,"message":"..."}`.
