
/**
 * PinchLib
 *
 * This file was automatically generated for Pinch by APIMATIC v2.0 ( https://apimatic.io ) on 05/16/2016
 */
var BaseModel = require("./BaseModel");
/**
 * Creates a instance of Webhook
 *
 * @constructor
 */
function Webhook() {
    this.id = null;     
    this.url = null;     
    this.webhookType = null;     
    //Append to variable dictionary
    this._variableDict['webhookType'] = 'webhook_type';
}

Webhook.prototype = new BaseModel();
Webhook.prototype.constructor = BaseModel;

/**
 * TODO: Write general description for this method
 *
 * @return {int}
 */
Webhook.prototype.getId = function() {
    return this.id;
};

/**
 * Setter for Id
 * 
 * @param {int} value 
 */
Webhook.prototype.setId = function(value) {
    this.id = value;
};

/**
 * TODO: Write general description for this method
 *
 * @return {string}
 */
Webhook.prototype.getUrl = function() {
    return this.url;
};

/**
 * Setter for Url
 * 
 * @param {string} value 
 */
Webhook.prototype.setUrl = function(value) {
    this.url = value;
};

/**
 * TODO: Write general description for this method
 *
 * @return {int}
 */
Webhook.prototype.getWebhookType = function() {
    return this.webhookType;
};

/**
 * Setter for WebhookType
 * 
 * @param {int} value 
 */
Webhook.prototype.setWebhookType = function(value) {
    this.webhookType = value;
};

module.exports = Webhook;