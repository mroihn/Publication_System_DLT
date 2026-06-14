const { ethers } = require("ethers");
const { RPC_WSS, RPC_HTTP, POLL_INTERVAL } = require("./config");

function createProvider() {
  if (RPC_WSS) {
    console.log(`[Provider] Connecting via WebSocket: ${RPC_WSS}`);
    return new ethers.WebSocketProvider(RPC_WSS);
  }
  console.log(`[Provider] No WSS URL — using HTTP polling (${POLL_INTERVAL}ms): ${RPC_HTTP}`);
  return new ethers.JsonRpcProvider(RPC_HTTP, undefined, {
    pollingInterval: POLL_INTERVAL,
  });
}

module.exports = { createProvider };
