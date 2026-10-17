# Design Direction: wireX network engineering workspace

The user requested the interface layout in interfaceOverview_1.jpg, including tool order, placement, and compact desktop proportions.

Design Read: network lab workspace for engineering students, in the desktop visual language of network simulation.
Dial: ENERGY 1 / RHYTHM 1 / MOTION 1.

- White title, menu, main toolbar, and common tools toolbar reproduce the reference's familiar command hierarchy.
- Navy (#122b4c) workspace and mode bars separate the canvas from application controls.
- Teal (#007f9f) selected tabs identify the active workspace and simulation mode.
- Arial with Segoe UI fallback approximates the reference's compact desktop typography and supports readable device labels.
- The white canvas is the focal point. The grid is optional and defaults off, matching the reference.
- Bottom panes group device categories, hardware models, and PDU scenarios in the reference's order.
- Compact, largely square controls preserve the desktop application's density. Rounded workspace tabs reproduce the reference's actual tab shapes.
- Hardware SVGs represent network equipment. Toolbar SVGs depict the corresponding desktop commands rather than decorative symbols.
- Shadows are reserved for dialogs and open menus to distinguish overlays.
- Packet motion represents simulated traffic; application chrome has no decorative animation.
- On narrow screens, the PDU pane moves beneath the device shelf and tool rows scroll within their containers. Touch targets increase to 44 pixels.
- User override R-30: reproduce Cisco's requested visual interface. Unsupported Cisco features are disclosed in their dialogs rather than presented as functional.
