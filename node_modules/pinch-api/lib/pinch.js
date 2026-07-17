/**
  * @module PinchLib
  *  
  * Pinch API
  */

var configuration = require('./configuration'),
    WebhookTypeController = require('./Controllers/WebhookTypeController'),
    WebhookController = require('./Controllers/WebhookController'),
    TicketController = require('./Controllers/TicketController'),
    Webhook = require('./Models/Webhook');


function initializer(){}

//Main functional components of PinchLib
initializer.configuration = configuration;
initializer.WebhookTypeController = WebhookTypeController;
initializer.WebhookController = WebhookController;
initializer.TicketController = TicketController;

//Main Models of PinchLib
initializer.Webhook = Webhook;

module.exports = initializer;