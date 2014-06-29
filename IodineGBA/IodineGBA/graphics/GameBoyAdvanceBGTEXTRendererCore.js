"use strict";
/*
 * This file is part of IodineGBA
 *
 * Copyright (C) 2012-2014 Grant Galitz
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
function GameBoyAdvanceBGTEXTRenderer(gfx, BGLayer) {
    this.gfx = gfx;
    this.VRAM = this.gfx.VRAM;
    this.VRAM16 = this.gfx.VRAM16;
    this.VRAM32 = this.gfx.VRAM32;
    this.palette16 = this.gfx.palette16;
    this.palette256 = this.gfx.palette256;
    this.BGLayer = BGLayer | 0;
    this.initialize();
}
GameBoyAdvanceBGTEXTRenderer.prototype.initialize = function () {
    this.scratchBuffer = getInt32Array(247);
    this.tileFetched = getInt32Array(8);
    this.BGXCoord = 0;
    this.BGYCoord = 0;
    this.palettePreprocess();
    this.screenSizePreprocess();
    this.priorityPreprocess();
    this.screenBaseBlockPreprocess();
    this.characterBaseBlockPreprocess();
}
GameBoyAdvanceBGTEXTRenderer.prototype.renderScanLine = function (line) {
    line = line | 0;
    if (this.gfx.BGMosaic[this.BGLayer & 3]) {
        //Correct line number for mosaic:
        line = ((line | 0) - (this.gfx.mosaicRenderer.getMosaicYOffset(line | 0) | 0)) | 0;
    }
    var yTileOffset = ((line | 0) + (this.BGYCoord | 0)) & 0x7;
    var yTileStart = ((line | 0) + (this.BGYCoord | 0)) >> 3;
    var xTileStart = this.BGXCoord >> 3;
    //Fetch tile attributes:
    var chrData = this.fetchTile(yTileStart | 0, xTileStart | 0) | 0;
    xTileStart = ((xTileStart | 0) + 1) | 0;
    //Get 8 pixels of data:
    this.processVRAM(chrData | 0, yTileOffset | 0);
    //Copy the buffered tile to line:
    this.fetchVRAMStart(this.BGXCoord & 0x7);
    //Render the rest of the tiles fast:
    this.renderWholeTiles(xTileStart | 0, yTileStart | 0, yTileOffset | 0);
    if (this.gfx.BGMosaic[this.BGLayer & 3]) {
        //Pixelize the line horizontally:
        this.gfx.mosaicRenderer.renderMosaicHorizontal(this.scratchBuffer);
    }
    return this.scratchBuffer;
}
if (__VIEWS_SUPPORTED__ && navigator.userAgent.toLowerCase().indexOf('chrome') < 0) {
    GameBoyAdvanceBGTEXTRenderer.prototype.renderWholeTiles = function (xTileStart, yTileStart, yTileOffset) {
        xTileStart = xTileStart | 0;
        yTileStart = yTileStart | 0;
        yTileOffset = yTileOffset | 0;
        //Process full 8 pixels at a time:
        for (var position = (8 - (this.BGXCoord & 0x7)) | 0; (position | 0) < 240; position = ((position | 0) + 8) | 0) {
            //Fetch tile attributes:
            //Get 8 pixels of data:
            this.processVRAM(this.fetchTile(yTileStart | 0, xTileStart | 0) | 0, yTileOffset | 0);
            //Copy the buffered tile to line:
            this.scratchBuffer.set(this.tileFetched, position | 0);
            //Increment a tile counter:
            xTileStart = ((xTileStart | 0) + 1) | 0;
        }
    }
}
else {
    GameBoyAdvanceBGTEXTRenderer.prototype.renderWholeTiles = function (xTileStart, yTileStart, yTileOffset) {
        //Process full 8 pixels at a time:
        for (var position = 8 - (this.BGXCoord & 0x7); position < 240; position += 8) {
            //Fetch tile attributes:
            //Get 8 pixels of data:
            this.processVRAM(this.fetchTile(yTileStart, xTileStart++), yTileOffset);
            //Copy the buffered tile to line:
            this.scratchBuffer[position] = this.tileFetched[0];
            this.scratchBuffer[position + 1] = this.tileFetched[1];
            this.scratchBuffer[position + 2] = this.tileFetched[2];
            this.scratchBuffer[position + 3] = this.tileFetched[3];
            this.scratchBuffer[position + 4] = this.tileFetched[4];
            this.scratchBuffer[position + 5] = this.tileFetched[5];
            this.scratchBuffer[position + 6] = this.tileFetched[6];
            this.scratchBuffer[position + 7] = this.tileFetched[7];
        }
    }
}
if (__LITTLE_ENDIAN__) {
    GameBoyAdvanceBGTEXTRenderer.prototype.fetchTile = function (yTileStart, xTileStart) {
        yTileStart = yTileStart | 0;
        xTileStart = xTileStart | 0;
        //Find the tile code to locate the tile block:
        var address = this.computeTileNumber(yTileStart | 0, xTileStart | 0) | this.BGScreenBaseBlock;
        return this.VRAM16[address & 0x7FFF] | 0;
    }
}
else {
    GameBoyAdvanceBGTEXTRenderer.prototype.fetchTile = function (yTileStart, xTileStart) {
        //Find the tile code to locate the tile block:
        var address = ((this.computeTileNumber(yTileStart, xTileStart) | this.BGScreenBaseBlock) << 1) & 0xFFFF;
        return (this.VRAM[address | 1] << 8) | this.VRAM[address];
    }
}
GameBoyAdvanceBGTEXTRenderer.prototype.computeTileNumber = function (yTile, xTile) {
    //Return the true tile number:
    yTile = yTile | 0;
    xTile = xTile | 0;
    var tileNumber = xTile & 0x1F;
    switch (this.tileMode | 0) {
        //1x1
        case 0:
            tileNumber = (tileNumber | 0) | ((yTile & 0x1F) << 5);
            break;
        //2x1
        case 1:
            tileNumber = (tileNumber | 0) | (((xTile & 0x20) | (yTile & 0x1F)) << 5);
            break;
        //1x2
        case 2:
            tileNumber = (tileNumber | 0) | ((yTile & 0x3F) << 5);
            break;
        //2x2
        case 3:
            tileNumber = (tileNumber | 0) | (((xTile & 0x20) | (yTile & 0x1F)) << 5) | ((yTile & 0x20) << 6);
    }
    return tileNumber | 0;
}
GameBoyAdvanceBGTEXTRenderer.prototype.process4BitVRAM = function (chrData, yOffset) {
    //16 color tile mode:
    chrData = chrData | 0;
    yOffset = yOffset | 0;
    //Parse flip attributes, grab palette, and then output pixel:
    var address = (chrData & 0x3FF) << 5;
    address = ((address | 0) + (this.BGCharacterBaseBlock | 0)) | 0;
    address = ((address | 0) + ((((chrData & 0x800) == 0x800) ? (0x7 - (yOffset | 0)) : (yOffset | 0)) << 2));
    //Copy out our pixels:
    this.render4BitVRAM(chrData >> 8, address | 0);
}
if (__LITTLE_ENDIAN__) {
    GameBoyAdvanceBGTEXTRenderer.prototype.render4BitVRAM = function (chrData, address) {
        chrData = chrData | 0;
        address = address | 0;
        var paletteOffset = chrData & 0xF0;
        var data = 0;
        //Unrolled data tile line fetch:
        if ((address | 0) < 0x10000) {
            //Tile address valid:
            data = this.VRAM32[address >> 2] | 0;
            if ((chrData & 0x4) == 0) {
                //Normal Horizontal:
                this.tileFetched[0] = this.palette16[paletteOffset | (data & 0xF)] | this.priorityFlag;
                this.tileFetched[1] = this.palette16[paletteOffset | ((data >> 4) & 0xF)] | this.priorityFlag;
                this.tileFetched[2] = this.palette16[paletteOffset | ((data >> 8) & 0xF)] | this.priorityFlag;
                this.tileFetched[3] = this.palette16[paletteOffset | ((data >> 12) & 0xF)] | this.priorityFlag;
                this.tileFetched[4] = this.palette16[paletteOffset | ((data >> 16) & 0xF)] | this.priorityFlag;
                this.tileFetched[5] = this.palette16[paletteOffset | ((data >> 20) & 0xF)] | this.priorityFlag;
                this.tileFetched[6] = this.palette16[paletteOffset | ((data >> 24) & 0xF)] | this.priorityFlag;
                this.tileFetched[7] = this.palette16[paletteOffset | ((data >> 28) & 0xF)] | this.priorityFlag;
            }
            else {
                //Flipped Horizontally:
                this.tileFetched[0] = this.palette16[paletteOffset | ((data >> 28) & 0xF)] | this.priorityFlag;
                this.tileFetched[1] = this.palette16[paletteOffset | ((data >> 24) & 0xF)] | this.priorityFlag;
                this.tileFetched[2] = this.palette16[paletteOffset | ((data >> 20) & 0xF)] | this.priorityFlag;
                this.tileFetched[3] = this.palette16[paletteOffset | ((data >> 16) & 0xF)] | this.priorityFlag;
                this.tileFetched[4] = this.palette16[paletteOffset | ((data >> 12) & 0xF)] | this.priorityFlag;
                this.tileFetched[5] = this.palette16[paletteOffset | ((data >> 8) & 0xF)] | this.priorityFlag;
                this.tileFetched[6] = this.palette16[paletteOffset | ((data >> 4) & 0xF)] | this.priorityFlag;
                this.tileFetched[7] = this.palette16[paletteOffset | (data & 0xF)] | this.priorityFlag;
            }
        }
        else {
            //In GBA mode on NDS, we display transparency on invalid tiles:
            data = this.gfx.transparency | this.priorityFlag;
            this.tileFetched[0] = data | 0;
            this.tileFetched[1] = data | 0;
            this.tileFetched[2] = data | 0;
            this.tileFetched[3] = data | 0;
            this.tileFetched[4] = data | 0;
            this.tileFetched[5] = data | 0;
            this.tileFetched[6] = data | 0;
            this.tileFetched[7] = data | 0;
        }
    }
}
else {
    GameBoyAdvanceBGTEXTRenderer.prototype.render4BitVRAM = function (chrData, address) {
        chrData = chrData | 0;
        address = address | 0;
        var paletteOffset = chrData & 0xF0;
        var data = 0;
        //Unrolled data tile line fetch:
        if ((address | 0) < 0x10000) {
            //Tile address valid:
            if ((chrData & 0x4) == 0) {
                //Normal Horizontal:
                data = this.VRAM[address | 0] | 0;
                this.tileFetched[0] = this.palette16[paletteOffset | (data & 0xF)] | this.priorityFlag;
                this.tileFetched[1] = this.palette16[paletteOffset | (data >> 4)] | this.priorityFlag;
                data = this.VRAM[address | 1] | 0;
                this.tileFetched[2] = this.palette16[paletteOffset | (data & 0xF)] | this.priorityFlag;
                this.tileFetched[3] = this.palette16[paletteOffset | (data >> 4)] | this.priorityFlag;
                data = this.VRAM[address | 2] | 0;
                this.tileFetched[4] = this.palette16[paletteOffset | (data & 0xF)] | this.priorityFlag;
                this.tileFetched[5] = this.palette16[paletteOffset | (data >> 4)] | this.priorityFlag;
                data = this.VRAM[address | 3] | 0;
                this.tileFetched[6] = this.palette16[paletteOffset | (data & 0xF)] | this.priorityFlag;
                this.tileFetched[7] = this.palette16[paletteOffset | (data >> 4)] | this.priorityFlag;
            }
            else {
                //Flipped Horizontally:
                data = this.VRAM[address | 0] | 0;
                this.tileFetched[7] = this.palette16[paletteOffset | (data & 0xF)] | this.priorityFlag;
                this.tileFetched[6] = this.palette16[paletteOffset | (data >> 4)] | this.priorityFlag;
                data = this.VRAM[address | 1] | 0;
                this.tileFetched[5] = this.palette16[paletteOffset | (data & 0xF)] | this.priorityFlag;
                this.tileFetched[4] = this.palette16[paletteOffset | (data >> 4)] | this.priorityFlag;
                data = this.VRAM[address | 2] | 0;
                this.tileFetched[3] = this.palette16[paletteOffset | (data & 0xF)] | this.priorityFlag;
                this.tileFetched[2] = this.palette16[paletteOffset | (data >> 4)] | this.priorityFlag;
                data = this.VRAM[address | 3] | 0;
                this.tileFetched[1] = this.palette16[paletteOffset | (data & 0xF)] | this.priorityFlag;
                this.tileFetched[0] = this.palette16[paletteOffset | (data >> 4)] | this.priorityFlag;
            }
        }
        else {
            //In GBA mode on NDS, we display transparency on invalid tiles:
            data = this.gfx.transparency | this.priorityFlag;
            this.tileFetched[0] = data | 0;
            this.tileFetched[1] = data | 0;
            this.tileFetched[2] = data | 0;
            this.tileFetched[3] = data | 0;
            this.tileFetched[4] = data | 0;
            this.tileFetched[5] = data | 0;
            this.tileFetched[6] = data | 0;
            this.tileFetched[7] = data | 0;
        }
    }
}
GameBoyAdvanceBGTEXTRenderer.prototype.process8BitVRAM = function (chrData, yOffset) {
    //256 color tile mode:
    chrData = chrData | 0;
    yOffset = yOffset | 0;
    //Parse flip attributes and output pixel:
    var address = (chrData & 0x3FF) << 6;
    address = ((address | 0) + (this.BGCharacterBaseBlock | 0)) | 0;
    address = ((address | 0) + ((((chrData & 0x800) == 0x800) ? (0x7 - (yOffset | 0)) : (yOffset | 0)) << 3)) | 0;
    //Copy out our pixels:
    this.render8BitVRAM(chrData | 0, address | 0);
}
if (__LITTLE_ENDIAN__) {
    GameBoyAdvanceBGTEXTRenderer.prototype.render8BitVRAM = function (chrData, address) {
        chrData = chrData | 0;
        address = address >> 2;
        var data = 0;
        if ((address | 0) < 0x4000) {
            //Tile address valid:
            if ((chrData & 0x400) == 0) {
                //Normal Horizontal:
                data = this.VRAM32[address | 0] | 0;
                this.tileFetched[0] = this.palette256[data & 0xFF] | this.priorityFlag;
                this.tileFetched[1] = this.palette256[(data >> 8) & 0xFF] | this.priorityFlag;
                this.tileFetched[2] = this.palette256[(data >> 16) & 0xFF] | this.priorityFlag;
                this.tileFetched[3] = this.palette256[data >>> 24] | this.priorityFlag;
                data = this.VRAM32[address | 1] | 0;
                this.tileFetched[4] = this.palette256[data & 0xFF] | this.priorityFlag;
                this.tileFetched[5] = this.palette256[(data >> 8) & 0xFF] | this.priorityFlag;
                this.tileFetched[6] = this.palette256[(data >> 16) & 0xFF] | this.priorityFlag;
                this.tileFetched[7] = this.palette256[data >>> 24] | this.priorityFlag;
            }
            else {
                //Flipped Horizontally:
                data = this.VRAM32[address | 1] | 0;
                this.tileFetched[0] = this.palette256[data >>> 24] | this.priorityFlag;
                this.tileFetched[1] = this.palette256[(data >> 16) & 0xFF] | this.priorityFlag;
                this.tileFetched[2] = this.palette256[(data >> 8) & 0xFF] | this.priorityFlag;
                this.tileFetched[3] = this.palette256[data & 0xFF] | this.priorityFlag;
                data = this.VRAM32[address | 0] | 0;
                this.tileFetched[4] = this.palette256[data >>> 24] | this.priorityFlag;
                this.tileFetched[5] = this.palette256[(data >> 16) & 0xFF] | this.priorityFlag;
                this.tileFetched[6] = this.palette256[(data >> 8) & 0xFF] | this.priorityFlag;
                this.tileFetched[7] = this.palette256[data & 0xFF] | this.priorityFlag;
            }
        }
        else {
            //In GBA mode on NDS, we display transparency on invalid tiles:
            data = this.gfx.transparency | this.priorityFlag;
            this.tileFetched[0] = data | 0;
            this.tileFetched[1] = data | 0;
            this.tileFetched[2] = data | 0;
            this.tileFetched[3] = data | 0;
            this.tileFetched[4] = data | 0;
            this.tileFetched[5] = data | 0;
            this.tileFetched[6] = data | 0;
            this.tileFetched[7] = data | 0;
        }
    }
}
else {
    GameBoyAdvanceBGTEXTRenderer.prototype.render8BitVRAM = function (chrData, address) {
        chrData = chrData | 0;
        address = address | 0;
        if ((address | 0) < 0x10000) {
            //Tile address valid:
            if ((chrData & 0x400) == 0) {
                //Normal Horizontal:
                this.tileFetched[0] = this.palette256[this.VRAM[address | 0] & 0xFF] | this.priorityFlag;
                this.tileFetched[1] = this.palette256[this.VRAM[address | 1] & 0xFF] | this.priorityFlag;
                this.tileFetched[2] = this.palette256[this.VRAM[address | 2] & 0xFF] | this.priorityFlag;
                this.tileFetched[3] = this.palette256[this.VRAM[address | 3] & 0xFF] | this.priorityFlag;
                this.tileFetched[4] = this.palette256[this.VRAM[address | 4] & 0xFF] | this.priorityFlag;
                this.tileFetched[5] = this.palette256[this.VRAM[address | 5] & 0xFF] | this.priorityFlag;
                this.tileFetched[6] = this.palette256[this.VRAM[address | 6] & 0xFF] | this.priorityFlag;
                this.tileFetched[7] = this.palette256[this.VRAM[address | 7] & 0xFF] | this.priorityFlag;
            }
            else {
                //Flipped Horizontally:
                this.tileFetched[7] = this.palette256[this.VRAM[address | 0] & 0xFF] | this.priorityFlag;
                this.tileFetched[6] = this.palette256[this.VRAM[address | 1] & 0xFF] | this.priorityFlag;
                this.tileFetched[5] = this.palette256[this.VRAM[address | 2] & 0xFF] | this.priorityFlag;
                this.tileFetched[4] = this.palette256[this.VRAM[address | 3] & 0xFF] | this.priorityFlag;
                this.tileFetched[3] = this.palette256[this.VRAM[address | 4] & 0xFF] | this.priorityFlag;
                this.tileFetched[2] = this.palette256[this.VRAM[address | 5] & 0xFF] | this.priorityFlag;
                this.tileFetched[1] = this.palette256[this.VRAM[address | 6] & 0xFF] | this.priorityFlag;
                this.tileFetched[0] = this.palette256[this.VRAM[address | 7] & 0xFF] | this.priorityFlag;
            }
        }
        else {
            //In GBA mode on NDS, we display transparency on invalid tiles:
            var data = this.gfx.transparency | this.priorityFlag;
            this.tileFetched[0] = data | 0;
            this.tileFetched[1] = data | 0;
            this.tileFetched[2] = data | 0;
            this.tileFetched[3] = data | 0;
            this.tileFetched[4] = data | 0;
            this.tileFetched[5] = data | 0;
            this.tileFetched[6] = data | 0;
            this.tileFetched[7] = data | 0;
        }
    }
}
GameBoyAdvanceBGTEXTRenderer.prototype.fetchVRAMStart = function (pixelPipelinePosition) {
    //Handle the the first tile of the scan-line specially:
    pixelPipelinePosition = pixelPipelinePosition | 0;
    switch (pixelPipelinePosition | 0) {
        case 0:
            this.scratchBuffer[0] = this.tileFetched[0] | 0;
        case 1:
            this.scratchBuffer[(1 - (pixelPipelinePosition | 0)) | 0] = this.tileFetched[1] | 0;
        case 2:
            this.scratchBuffer[(2 - (pixelPipelinePosition | 0)) | 0] = this.tileFetched[2] | 0;
        case 3:
            this.scratchBuffer[(3 - (pixelPipelinePosition | 0)) | 0] = this.tileFetched[3] | 0;
        case 4:
            this.scratchBuffer[(4 - (pixelPipelinePosition | 0)) | 0] = this.tileFetched[4] | 0;
        case 5:
            this.scratchBuffer[(5 - (pixelPipelinePosition | 0)) | 0] = this.tileFetched[5] | 0;
        case 6:
            this.scratchBuffer[(6 - (pixelPipelinePosition | 0)) | 0] = this.tileFetched[6] | 0;
        case 7:
            this.scratchBuffer[(7 - (pixelPipelinePosition | 0)) | 0] = this.tileFetched[7] | 0;
    }
}
GameBoyAdvanceBGTEXTRenderer.prototype.palettePreprocess = function () {
    //Make references:
    if (this.gfx.BGPalette256[this.BGLayer & 3]) {
        this.processVRAM = this.process8BitVRAM;
    }
    else {
        this.processVRAM = this.process4BitVRAM;
    }
}
GameBoyAdvanceBGTEXTRenderer.prototype.screenSizePreprocess = function () {
    this.tileMode = this.gfx.BGScreenSize[this.BGLayer & 0x3] | 0;
}
GameBoyAdvanceBGTEXTRenderer.prototype.priorityPreprocess = function () {
    this.priorityFlag = (this.gfx.BGPriority[this.BGLayer & 3] << 23) | (1 << (this.BGLayer | 0x10));
}
GameBoyAdvanceBGTEXTRenderer.prototype.screenBaseBlockPreprocess = function () {
    this.BGScreenBaseBlock = this.gfx.BGScreenBaseBlock[this.BGLayer & 3] << 10;
}
GameBoyAdvanceBGTEXTRenderer.prototype.characterBaseBlockPreprocess = function () {
    this.BGCharacterBaseBlock = this.gfx.BGCharacterBaseBlock[this.BGLayer & 3] << 14;
}
GameBoyAdvanceBGTEXTRenderer.prototype.writeBGHOFS0 = function (data) {
    data = data | 0;
    this.BGXCoord = (this.BGXCoord & 0x100) | data;
}
GameBoyAdvanceBGTEXTRenderer.prototype.writeBGHOFS1 = function (data) {
    data = data | 0;
    this.BGXCoord = ((data & 0x01) << 8) | (this.BGXCoord & 0xFF);
}
GameBoyAdvanceBGTEXTRenderer.prototype.writeBGVOFS0 = function (data) {
    data = data | 0;
    this.BGYCoord = (this.BGYCoord & 0x100) | data;
}
GameBoyAdvanceBGTEXTRenderer.prototype.writeBGVOFS1 = function (data) {
    data = data | 0;
    this.BGYCoord = ((data & 0x01) << 8) | (this.BGYCoord & 0xFF);
}