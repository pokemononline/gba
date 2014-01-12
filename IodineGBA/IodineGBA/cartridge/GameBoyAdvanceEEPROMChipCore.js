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
function GameBoyAdvanceEEPROMChip(IOCore) {
    this.saves = null;
    this.largestSizePossible = 0x200;
    this.mode = 0;
    this.bitsProcessed = 0;
    this.address = 0;
    this.buffer = getUint8Array(8);
    this.IOCore = IOCore;
    //Special note to emulator authors: EEPROM command ending bit "0" can also be a "1"...
}
GameBoyAdvanceEEPROMChip.prototype.initialize = function () {
    this.allocate();
}
GameBoyAdvanceEEPROMChip.prototype.allocate = function () {
    if (this.saves == null || (this.saves.length | 0) < (this.largestSizePossible | 0)) {
        //Allocate the new array:
        var newSave = getUint8Array(this.largestSizePossible | 0);
        //Init to default value:
        for (var index = 0; (index | 0) < (this.largestSizePossible | 0); index = ((index | 0) + 1) | 0) {
            newSave[index | 0] = 0xFF;
        }
        //Copy the old save data out:
        if (this.saves != null) {
            for (var index = 0; (index | 0) < (this.saves.length | 0); index = ((index | 0) + 1) | 0) {
                newSave[index | 0] = this.saves[index | 0] | 0;
            }
        }
        //Assign the new array out:
        this.saves = newSave;
    }
}
GameBoyAdvanceEEPROMChip.prototype.load = function (save) {
    if ((save.length | 0) == 0x200 || (save.length | 0) == 0x2000) {
        this.saves = save;
    }
}
GameBoyAdvanceEEPROMChip.prototype.read8 = function () {
    //Can't do real reading with 8-bit reads:
    return 0x1;
}
GameBoyAdvanceEEPROMChip.prototype.read16 = function () {
    var data = 1;
    switch (this.mode | 0) {
        case 0x5:
            //Return 4 junk 0 bits:
            data = 0;
            if ((this.bitsProcessed | 0) < 3) {
                //Increment our bits counter:
                this.bitsProcessed = ((this.bitsProcessed | 0) + 1) | 0;
            }
            else {
                //Reset our bits counter:
                this.bitsProcessed = 0;
                //Change mode for the actual reads:
                this.mode = 6;
            }
            break;
        case 0x6:
            //Return actual serial style data:
            var address = ((this.bitsProcessed >> 3) + (this.address | 0)) | 0;
            data = (this.saves[address | 0] >> ((0x7 - (this.bitsProcessed & 0x7)) | 0)) & 0x1;
            //Check for end of read:
            if ((this.bitsProcessed | 0) < 0x3F) {
                //Increment our bits counter:
                this.bitsProcessed = ((this.bitsProcessed | 0) + 1) | 0;
            }
            else {
                //Finished read and now idle:
                this.resetMode();
            }
    }
    return data | 0;
}
GameBoyAdvanceEEPROMChip.prototype.read32 = function () {
    //Can't do real reading with 32-bit reads:
    return 0x10001;
}
GameBoyAdvanceEEPROMChip.prototype.write8 = function (data) {
    //Fails on hardware
}
GameBoyAdvanceEEPROMChip.prototype.write16 = function (data) {
    data = data & 0x1;
    if ((this.IOCore.systemStatus & 0x1) == 0x1) {
        //Writes only work in DMA:
        switch (this.mode | 0) {
                //Idle Mode:
            case 0:
                this.mode = data | 0;
                break;
                //Select Mode:
            case 0x1:
                this.selectMode(data | 0);
                break;
                //Address Mode (Write):
            case 0x2:
                this.addressModeForWrite(data | 0);
                break;
                //Address Mode (Read):
            case 0x3:
                this.addressModeForRead(data | 0);
                break;
                //Write Mode:
            case 0x4:
                this.writeMode(data | 0);
                break;
                //Read Mode:
            case 0x5:
            case 0x6:
                this.resetMode();
        }
    }
}
GameBoyAdvanceEEPROMChip.prototype.write32 = function (data) {
    //Fails on hardware
}
GameBoyAdvanceEEPROMChip.prototype.selectMode = function (data) {
    data = data | 0;
    //Reset our address:
    this.address = 0;
    //Reset our bits counter:
    this.bitsProcessed = 0;
    //Read the mode bit:
    this.mode = 0x2 | data;
}
GameBoyAdvanceEEPROMChip.prototype.addressModeForWrite = function (data) {
    data = data | 0;
    //Shift in our address bit:
    this.address = (this.address << 1) | data;
    //Increment our bits counter:
    this.bitsProcessed = ((this.bitsProcessed | 0) + 1) | 0;
    //Check for how many bits we've shifted in:
    switch (this.bitsProcessed | 0) {
        case 0x6:
            //6 bit address mode:
            if (this.IOCore.dma.channels[3].wordCountShadow < 0x4A && (this.largestSizePossible | 0) == 0x200) {
                this.changeModeToActive();
            }
            else {
                this.largestSizePossible = 0x2000;
                this.allocate();
            }
            break;
        case 0xE:
            //14 bit address mode:
            this.changeModeToActive();
    }
}
GameBoyAdvanceEEPROMChip.prototype.addressModeForRead = function (data) {
    data = data | 0;
    //Check for how many bits we've shifted in:
    switch (this.bitsProcessed | 0) {
        case 0x6:
            //6 bit address mode:
            if (this.IOCore.dma.channels[3].wordCountShadow < 0xA && (this.largestSizePossible | 0) == 0x200) {
                this.changeModeToActive();
            }
            else {
                this.largestSizePossible = 0x2000;
                this.allocate();
            }
            break;
        case 0xE:
            //14 bit address mode:
            this.changeModeToActive();
            break;
        default:
            //Shift in our address bit:
            this.address = (this.address << 1) | data;
            //Increment our bits counter:
            this.bitsProcessed = ((this.bitsProcessed | 0) + 1) | 0;
    }
}
GameBoyAdvanceEEPROMChip.prototype.changeModeToActive = function () {
    //Ensure the address range:
    this.address &= 0x3FF;
    //Addressing in units of 8 bytes:
    this.address <<= 3;
    //Reset our bits counter:
    this.bitsProcessed = 0;
    //Change to R/W Mode:
    this.mode = ((this.mode | 0) + 2) | 0;
}
GameBoyAdvanceEEPROMChip.prototype.writeMode = function (data) {
    data = data | 0;
    if ((this.bitsProcessed | 0) < 0x40) {
        //Push a bit into the buffer:
        this.pushBuffer(data | 0);
        //Save on last write bit push:
        if ((this.bitsProcessed | 0) == 0x40) {
            //64 bits buffered, so copy our buffer to the save data:
            this.copyBuffer();
        }
    }
    else {
        //Reset back to initial:
        this.resetMode();
    }
}
GameBoyAdvanceEEPROMChip.prototype.pushBuffer = function (data) {
    data = data | 0;
    //Push a bit through our serial buffer:
    var bufferPosition = this.bitsProcessed >> 3;
    this.buffer[bufferPosition & 0x7] = ((this.buffer[bufferPosition & 0x7] << 1) & 0xFE) | data;
    this.bitsProcessed = ((this.bitsProcessed | 0) + 1) | 0;
}
GameBoyAdvanceEEPROMChip.prototype.copyBuffer = function () {
    //Copy 8 bytes from buffer to EEPROM save data starting at address offset:
    for (var index = 0; (index | 0) < 8; index = ((index | 0) + 1) | 0) {
        this.saves[this.address | index] = this.buffer[index & 0x7] & 0xFF;
    }
}
GameBoyAdvanceEEPROMChip.prototype.resetMode = function () {
    //Reset back to idle:
    this.mode = 0;
}