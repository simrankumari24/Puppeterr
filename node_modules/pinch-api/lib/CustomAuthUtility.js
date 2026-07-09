/**
  * PinchLib
  *
  * This file was automatically generated for Pinch by APIMATIC v2.0 ( https://apimatic.io ) on 05/16/2016
  */

var configuration = require('./configuration');

var CustomAuthUtility = {

    /**
     * Appends the necessary custom credentials for making this authorized call
     * @param	{HttpRequest} request    The out going request to access the resource
     */
    appendCustomAuthParams:function(request) {
        // TODO: Add your custom authentication here
        // The following properties are available to use
      // configuration.xAPITOKEN
      // configuration.xAPIEMAIL
        // 
        // ie. Add a header through:
        //request.headers["key"] = "value"

    }
};

module.exports = CustomAuthUtility;