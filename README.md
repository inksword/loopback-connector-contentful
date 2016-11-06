## loopback-connector-contentful
The lib is still under development, and not fully tested. This will be used by one of my project, and I am still doing experiments with it.

### How to Use

Install the connector for your project.

```bash
$ npm install loopback-connector-contentful --save
```

Add the following configuration to the datasources.json.

```json
"contentful": {
  "name": "contentful",
  "connector": "contentful",
  "accessToken": "<access token>",
  "spaceId": "<space id>",
  "debug": true | false
}
```

