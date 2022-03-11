'use strict';

/**
 * Load Twilio configuration from .env config file
 */
require('dotenv').load();

const http = require('http');
const express = require('express');
const ngrok = require('ngrok');
const flex = require('./flex-custom-webchat');
const client = require('twilio')(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const whatsappFlexNumber = `whatsapp:+14155238886`

// Create Express webapp and connect socket.io
var app = express();
var server = http.createServer(app);
var io = require('socket.io')(server);

// Static pages goes in ./public folder
app.use(express.static('public'));

var bodyParser = require('body-parser');
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));



app.post('/new-message', async function(request, response) {
  console.log('Twilio new message webhook fired');
  const { Source, Body } = request.body
  if (Source === 'SDK' ) {
    sendMessageFromFlexToWhatsapp(process.env.FLEX_CHAT_SERVICE, request)
  }
  console.log('Next line is the request body for new messages')
  console.log(request.body)
  response.sendStatus(200);
});

const sendMessageFromFlexToWhatsapp = async (flexChatService, req) => {
  const { Body, ChannelSid } = req.body
  const whatsappToNumber = await getWhatsappNumberFromChannel(flexChatService, ChannelSid)
  client.messages.create({
    body: Body,
    to: whatsappToNumber,
    from: whatsappFlexNumber
  })
  .then(message => console.log(message.sid))
  .catch(err => console.log(err))
}

const getWhatsappNumberFromChannel = async (flexChatService, channelSid) => {
  const channelInfo = await getChannelInfo(flexChatService, channelSid)
  const parsedAttributes = JSON.parse(channelInfo.attributes)
  return parsedAttributes.from
}

const getChannelInfo = async (flexChatService, channelSid) => {
  return await client.chat.v2.services(flexChatService)
                .channels(channelSid)
                .fetch()
                .then(channel => {return channel})
}

app.post('/channel-update', function(request, response) {
  console.log('Twilio channel update webhook fired');
  let status = JSON.parse(request.body.Attributes).status;
  console.log('Channel Status: ' + status);
  flex.resetChannel(status);
  response.sendStatus(200);
});


app.post('/new-whatsapp', (req, res) => {
  console.log('Whatsapp message arrives at server')
  const { From, Body} = req.body
  console.log(From, Body)
  flex.sendMessageToFlex(Body, From)
})


io.on('connection', function(socket) {
  console.log('User connected');
  socket.on('chat message', function(msg) {
    flex.sendMessageToFlex(msg);
    io.emit('chat message', msg);
  });
});

// Create http server and run it.
var port = process.env.PORT || 3000;
server.listen(port, function() {
  console.log('Express server running on *:' + port);
  // Enable ngrok
  ngrok
    .connect({
      addr: port,
      subdomain: process.env.NGROK_SUBDOMAIN,
      region: 'eu'
    })
    .then(url => {
      console.log(`ngrok forwarding: ${url} -> http://localhost:${port}`);
      process.env.WEBHOOK_BASE_URL = url
    })
    .catch(e => {
      console.log('ngrok error: ', e);
    });
});
