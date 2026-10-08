import 'dotenv/config'
import { createServer } from 'node:http'
import { createApp } from './app.js'
import { attachParaformerProxy } from './paraformerProxy.js'

const port = Number(process.env.PORT || 8787)
const { app } = createApp()
const server = createServer(app)
attachParaformerProxy(server)

server.listen(port, () => {
  console.log(`api listening on http://localhost:${port}`)
})
