OnOff
===
OnOff is a web based IoT device manager. It's primary usecase is to
control Grus SmartSocket prototypes. It can however evolve to become a
generic manager for devices that are integrated with the Grus IoT platform.

Installation
===

1. clone the repo
2. run 'nmp install'

Start
===

$ bin/www

or using debugging:

$ DEBUG=OnOff*,DMB,AWS_MSG,DMB_WS*,DMB_EV* bin/www

Debug flags
===
OnOff        : generic OnOff debugging
OnOff_EV_EMIT: event emitting
OnOff_EV_RECV: event receiving

AWS          : generic AWS debugging
AWS_MSG      : message sending or receiving

DMB          : generic DMB debugging
DMB_EV_EMIT  : event emitting
DMB_EV_RECV  : event receiving
DMB_WS_SEND  : websocket message sending
DMB_WS_RECV  : websocket message receiving
