PinchLib
=================
This file was automatically generated for Pinch by APIMATIC v2.0 ( https://apimatic.io ) on 05/16/2016


How To Install: 
=============
The generated code relies on node package manager (npm) being available to resolve dependencies.
Once published you will need copy the folder 'pinchlib' in to your 'node_modules' folder.

  
How To Use:
===========
The following shows how import the controllers and use:

1) Import the module:

        var pinchlib = require('pinchlib');
2) Configure any authentication parameters. For example:

        var config = pinchlib.configuration;
        config.apikey = a_secret_key;

3) Access various controllers by:

        var controller = pinchlib.XYZ;
        controller.getItems(id, callback);
    

