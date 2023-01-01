'use strict';

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['leaflet'], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory(require('leaflet'));
  } else {
    factory(window.L);
  }
}(this, function (L) {
  L.Canvas.include({
    _updateImg(layer) {
      const { img, topIcons, bottomLeftIcons, bottomRightIcons } = layer.options;
      const p = layer._point.round();
      p.x += img.offset.x; p.y += img.offset.y;

      if (img.rotate) {
        this._ctx.save();
        this._ctx.translate(p.x, p.y);
        this._ctx.rotate(img.rotate * Math.PI / 180);
        this._ctx.drawImage(img.el, -img.size[0] / 2, -img.size[1] / 2, img.size[0], img.size[1]);
        this._ctx.restore();
      } else {
        this._ctx.drawImage(img.el, p.x - img.size[0] / 2, p.y - img.size[1] / 2, img.size[0], img.size[1]);
      }

      for (let i = 0; i < topIcons.length; i++) {
        const icon = topIcons[i];
        this._ctx.drawImage(icon, p.x - img.size[0] * .5 + (i * 11) + (icon.drawOffset[0]), p.y - img.size[1] * .6 + (icon.drawOffset[1]), icon.drawSize[0], icon.drawSize[1])
      }

      for (let i = 0; i < bottomRightIcons.length; i++) {
        const icon = bottomRightIcons[i];
        this._ctx.drawImage(icon, p.x + img.size[0] * .15 + (icon.drawOffset[0]), p.y + img.size[1] * .1 + (icon.drawOffset[1]) + (i * icon.drawSize[1] + 2), icon.drawSize[0], icon.drawSize[1])
      }

      for (let i = 0; i < bottomLeftIcons.length; i++) {
        const icon = bottomLeftIcons[i];
        this._ctx.drawImage(icon, p.x - img.size[0] * .55 + (icon.drawOffset[0]), p.y + img.size[1] * .1 + (icon.drawOffset[1])  + (i * icon.drawSize[1] + 2), icon.drawSize[0], icon.drawSize[1])
      }
    },
  });

  const angleCrds = (map, prevLatlng, latlng) => {
    if (!latlng || !prevLatlng) return 0;
    const pxStart = map.project(prevLatlng);
    const pxEnd = map.project(latlng);
    return Math.atan2(pxStart.y - pxEnd.y, pxStart.x - pxEnd.x) / Math.PI * 180 - 90;
  };

  const defaultImgOptions = {
    rotate: 0,
    size: [40, 40],
    offset: { x: 0, y: 0 },
  };

  const CanvasMarker = L.CircleMarker.extend({
    _updatePath() {
      if (!this.options.img || !this.options.img.url) return;
      if (!this.options.img.el) {
        this.options.topIcons = [];
        this.options.bottomLeftIcons = [];
        this.options.bottomRightIcons = [];

        this.options.img = {...defaultImgOptions, ...this.options.img};
        this.options.img.rotate += angleCrds(this._map, this.options.prevLatlng, this._latlng);
        const img = document.createElement('img');
        img.src = this.options.img.url;
        this.options.img.el = img;

        this.options.overlayIcons.forEach((iconData) => {
          const icon = document.createElement("img");
          icon.src = iconData.url;
          icon.drawOffset = iconData.offset;
          icon.drawSize = iconData.size;

          switch(iconData.position) {
            case "top":
              return this.options.topIcons.push(icon)
            case "bottomLeft":
              return this.options.bottomLeftIcons.push(icon);
            case "bottomRight":
              return this.options.bottomRightIcons.push(icon);
          }
        })

        img.onload = () => {
          this.redraw();
        };
        img.onerror = () => {
          this.options.img = null;
        };
      } else {
        this._renderer._updateImg(this);
      }
    },
  });

  L.canvasMarker = function (...opt) {
    try {
      const i = opt.findIndex(o => typeof o === 'object' && o.img);
      if (i+1) {
        if (!opt[i].radius && opt[i].img && opt[i].img.size) opt[i].radius = Math.ceil(Math.max(...opt[i].img.size)/2);
        if (opt[i].pane) delete opt[i].pane;
      }
    } catch(e) {}
    return new CanvasMarker(...opt);
  };
}));
