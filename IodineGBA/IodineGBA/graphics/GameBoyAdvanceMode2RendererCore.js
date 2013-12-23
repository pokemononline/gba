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
function GameBoyAdvanceMode2Renderer(gfx) {
    this.gfx = gfx;
}
GameBoyAdvanceMode2Renderer.prototype.renderScanLine = function (line) {
    var BG2Buffer = (this.gfx.displayBG2) ? this.gfx.bg2MatrixRenderer.renderScanLine(line) : null;
    var BG3Buffer = (this.gfx.displayBG3) ? this.gfx.bg3MatrixRenderer.renderScanLine(line) : null;
    var OBJBuffer = (this.gfx.displayOBJ) ? this.gfx.objRenderer.renderScanLine(line) : null;
    this.gfx.compositeLayers(OBJBuffer, null, null, BG2Buffer, BG3Buffer);
    if (this.gfx.displayObjectWindowFlag) {
        this.gfx.objWindowRenderer.renderScanLine(line, this.gfx.lineBuffer, OBJBuffer, null, null, BG2Buffer, BG3Buffer);
    }
    if (this.gfx.displayWindow1Flag) {
        this.gfx.window1Renderer.renderScanLine(line, this.gfx.lineBuffer, OBJBuffer, null, null, BG2Buffer, BG3Buffer);
    }
    if (this.gfx.displayWindow0Flag) {
        this.gfx.window0Renderer.renderScanLine(line, this.gfx.lineBuffer, OBJBuffer, null, null, BG2Buffer, BG3Buffer);
    }
    this.gfx.copyLineToFrameBuffer(line);
}