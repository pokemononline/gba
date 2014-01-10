"use strict";
/*
 * This file is part of IodineGBA
 *
 * Copyright (C) 2012-2013 Grant Galitz
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * version 2 as published by the Free Software Foundation.
 * The full license is available at http://www.gnu.org/licenses/gpl.html
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 */
function GlueCodeGfx() {
    this.didRAF = false;                      //Set when rAF has been used.
    this.graphicsFound = 0;                   //Do we have graphics output sink found yet?
    this.offscreenWidth = 240;                //Width of the GBA screen.
    this.offscreenHeight = 160;               //Height of the GBA screen.
    this.doSmoothing = true;
    //Cache some frame buffer lengths:
    var offscreenRGBCount = this.offscreenWidth * this.offscreenHeight * 3;
    this.swizzledFrameFree = [getUint8Array(offscreenRGBCount), getUint8Array(offscreenRGBCount)];
    this.swizzledFrameReady = [];
    this.initializeGraphicsBuffer();          //Pre-set the swizzled buffer for first frame.
}
GlueCodeGfx.prototype.attachCanvas = function (canvas) {
    this.canvas = canvas;
    this.graphicsFound = this.initializeCanvasTarget();
    this.setSmoothScaling(this.doSmoothing);
}
GlueCodeGfx.prototype.detachCanvas = function () {
    this.canvas = null;
}
GlueCodeGfx.prototype.recomputeDimension = function () {
    //Cache some dimension info:
    this.canvasLastWidth = this.canvas.clientWidth;
    this.canvasLastHeight = this.canvas.clientHeight;
    if (window.mozRequestAnimationFrame) {    //Sniff out firefox for selecting this path.
        //Set target as unscaled:
        this.onscreenWidth = this.canvas.width = this.offscreenWidth;
        this.onscreenHeight = this.canvas.height = this.offscreenHeight;
    }
    else {
        //Set target canvas as scaled:
        this.onscreenWidth = this.canvas.width = this.canvas.clientWidth;
        this.onscreenHeight = this.canvas.height = this.canvas.clientHeight;
    }
}
GlueCodeGfx.prototype.initializeCanvasTarget = function () {
    try {
        //Obtain dimensional information:
        this.recomputeDimension();
        //Get handles on the canvases:
        this.canvasOffscreen = document.createElement("canvas");
        this.canvasOffscreen.width = this.offscreenWidth;
        this.canvasOffscreen.height = this.offscreenHeight;
        this.drawContextOffscreen = this.canvasOffscreen.getContext("2d");
        this.drawContextOnscreen = this.canvas.getContext("2d");
        //Get a CanvasPixelArray buffer:
        this.canvasBuffer = this.getBuffer(this.drawContextOffscreen, this.offscreenWidth, this.offscreenHeight);
        //Initialize Alpha Channel:
        this.initializeAlpha(this.canvasBuffer.data);
        //Draw swizzled buffer out as a test:
        this.requestDraw();
        this.checkRAF();
        //Success:
        return true;
    }
    catch (error) {
        //Failure:
        return false;
    }
}
GlueCodeGfx.prototype.setSmoothScaling = function (doSmoothing) {
    this.doSmoothing = doSmoothing;
    if (this.graphicsFound) {
        this.canvas.setAttribute("style", (this.canvas.getAttribute("style") || "") + "; image-rendering: " + ((doSmoothing) ? "auto" : "-webkit-optimize-contrast") + ";" +
            "image-rendering: " + ((doSmoothing) ? "optimizeQuality" : "-o-crisp-edges") + ";" +
            "image-rendering: " + ((doSmoothing) ? "optimizeQuality" : "-moz-crisp-edges") + ";" +
            "-ms-interpolation-mode: " + ((doSmoothing) ? "bicubic" : "nearest-neighbor") + ";");
        this.drawContextOnscreen.mozImageSmoothingEnabled = doSmoothing;
        this.drawContextOnscreen.webkitImageSmoothingEnabled = doSmoothing;
        this.drawContextOnscreen.imageSmoothingEnabled = doSmoothing;
    }
}
GlueCodeGfx.prototype.initializeAlpha = function (canvasData) {
    var length = canvasData.length;
    for (var indexGFXIterate = 3; indexGFXIterate < length; indexGFXIterate += 4) {
        canvasData[indexGFXIterate] = 0xFF;
    }
}
GlueCodeGfx.prototype.getBuffer = function (canvasContext, width, height) {
    //Get a CanvasPixelArray buffer:
    var buffer = null;
    try {
        buffer = this.drawContextOffscreen.createImageData(width, height);
    }
    catch (error) {
        buffer = this.drawContextOffscreen.getImageData(0, 0, width, height);
    }
    return buffer;
}
GlueCodeGfx.prototype.copyBuffer = function (buffer) {
    if (this.graphicsFound) {
        if (this.swizzledFrameFree.length == 0) {
           this.swizzledFrameFree.push(this.swizzledFrameReady.shift());
        }
        var swizzledFrame = this.swizzledFrameFree.shift();
        var length = swizzledFrame.length;
        if (buffer.buffer) {
            swizzledFrame.set(buffer);
        }
        else {
            for (var bufferIndex = 0; bufferIndex < length; ++bufferIndex) {
                swizzledFrame[bufferIndex] = buffer[bufferIndex];
            }
        }
        this.swizzledFrameReady.push(swizzledFrame);
        if (!window.requestAnimationFrame || navigator.platform === "iPad" || navigator.platform === "iPhone" || navigator.platform === "iPod") {
            this.requestDraw();
        }
        else if (!this.didRAF) {
            //Prime RAF draw:
            var parentObj = this;
            window.requestAnimationFrame(function () {
                if (parentObj.canvas) {
                    parentObj.requestRAFDraw();
                }
            });
        }
    }
}
GlueCodeGfx.prototype.requestRAFDraw = function () {
    this.didRAF = true;
    this.requestDraw();
}
GlueCodeGfx.prototype.requestDraw = function () {
    if (this.swizzledFrameReady.length > 0) {
        var canvasData = this.canvasBuffer.data;
        var bufferIndex = 0;
        var swizzledFrame = this.swizzledFrameReady.shift();
        var length = canvasData.length;
        for (var canvasIndex = 0; canvasIndex < length; ++canvasIndex) {
            canvasData[canvasIndex++] = swizzledFrame[bufferIndex++];
            canvasData[canvasIndex++] = swizzledFrame[bufferIndex++];
            canvasData[canvasIndex++] = swizzledFrame[bufferIndex++];
        }
        this.swizzledFrameFree.push(swizzledFrame);
        this.graphicsBlit();
    }
    if (this.didRAF) {
        var parentObj = this;
        window.requestAnimationFrame(function () {
            if (parentObj.canvas) {
                parentObj.requestDraw();
            }
        });
    }
}
GlueCodeGfx.prototype.graphicsBlit = function () {
    if (this.canvasLastWidth != this.canvas.clientWidth || this.canvasLastHeight != this.canvas.clientHeight) {
        this.recomputeDimension();
        this.setSmoothScaling(this.doSmoothing);
    }
    if (this.offscreenWidth == this.onscreenWidth && this.offscreenHeight == this.onscreenHeight) {
        //Canvas does not need to scale, draw directly to final:
        this.drawContextOnscreen.putImageData(this.canvasBuffer, 0, 0);
    }
    else {
        //Canvas needs to scale, draw to offscreen first:
        this.drawContextOffscreen.putImageData(this.canvasBuffer, 0, 0);
        //Scale offscreen canvas image onto the final:
        this.drawContextOnscreen.drawImage(this.canvasOffscreen, 0, 0, this.onscreenWidth, this.onscreenHeight);
    }
}
GlueCodeGfx.prototype.initializeGraphicsBuffer = function () {
    //Initialize the first frame to a white screen:
    var swizzledFrame = this.swizzledFrameFree.shift();
    var length = swizzledFrame.length;
    for (var bufferIndex = 0; bufferIndex < length; ++bufferIndex) {
        swizzledFrame[bufferIndex] = 0xF8;
    }
    this.swizzledFrameReady.push(swizzledFrame);
}
GlueCodeGfx.prototype.checkRAF = function () {
    window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
    window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
}