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
function GameBoyAdvanceDMA1(dma) {
    this.DMACore = dma;
    this.initialize();
}
GameBoyAdvanceDMA1.prototype.DMA_ENABLE_TYPE = [            //DMA Channel 1 Mapping:
    0x1,
    0x2,
    0x4,
    0x8
];
GameBoyAdvanceDMA1.prototype.DMA_REQUEST_TYPE = {
    IMMEDIATE:      0x1,
    V_BLANK:        0x2,
    H_BLANK:        0x4,
    FIFO_A:         0x8
}
GameBoyAdvanceDMA1.prototype.initialize = function () {
    this.enabled = 0;
    this.pending = 0;
    this.source = 0;
    this.sourceShadow = 0;
    this.destination = 0;
    this.destinationShadow = 0;
    this.wordCount = 0;
    this.wordCountShadow = 0;
    this.irqFlagging = 0;
    this.dmaType = 0;
    this.is32Bit = 0;
    this.repeat = 0;
    this.sourceControl = 0;
    this.destinationControl = 0;
    this.memoryAccessCache = new GameBoyAdvanceMemoryCache(this.DMACore.IOCore.memory);
}
GameBoyAdvanceDMA1.prototype.writeDMASource0 = function (data) {
    data = data | 0;
    this.source = this.source & 0xFFFFFF00;
    this.source = this.source | data;
}
GameBoyAdvanceDMA1.prototype.writeDMASource1 = function (data) {
    data = data | 0;
    this.source = this.source & 0xFFFF00FF;
    this.source = this.source | (data << 8);
}
GameBoyAdvanceDMA1.prototype.writeDMASource2 = function (data) {
    data = data | 0;
    this.source = this.source & 0xFF00FFFF;
    this.source = this.source | (data << 16);
}
GameBoyAdvanceDMA1.prototype.writeDMASource3 = function (data) {
    data = data & 0xF;
    this.source = this.source & 0xFFFFFF;
    this.source = this.source | (data << 24);
}
GameBoyAdvanceDMA1.prototype.writeDMADestination0 = function (data) {
    data = data | 0;
    this.destination = this.destination & 0xFFFFFF00;
    this.destination = this.destination | data;
}
GameBoyAdvanceDMA1.prototype.writeDMADestination1 = function (data) {
    data = data | 0;
    this.destination = this.destination & 0xFFFF00FF;
    this.destination = this.destination | (data << 8);
}
GameBoyAdvanceDMA1.prototype.writeDMADestination2 = function (data) {
    data = data | 0;
    this.destination = this.destination & 0xFF00FFFF;
    this.destination = this.destination | (data << 16);
}
GameBoyAdvanceDMA1.prototype.writeDMADestination3 = function (data) {
    data = data & 0x7;
    this.destination = this.destination & 0xFFFFFF;
    this.destination = this.destination | (data << 24);
}
GameBoyAdvanceDMA1.prototype.writeDMAWordCount0 = function (data) {
    data = data | 0;
    this.wordCount = this.wordCount & 0xFF00;
    this.wordCount = this.wordCount | data;
}
GameBoyAdvanceDMA1.prototype.writeDMAWordCount1 = function (data) {
    data = data & 0x3F;
    this.wordCount = this.wordCount & 0xFF;
    this.wordCount = this.wordCount | (data << 8);
}
GameBoyAdvanceDMA1.prototype.writeDMAControl0 = function (data) {
    data = data | 0;
    this.destinationControl = (data >> 5) & 0x3;
    this.sourceControl = this.sourceControl & 0x2;
    this.sourceControl = this.sourceControl | ((data >> 7) & 0x1);
}
GameBoyAdvanceDMA1.prototype.readDMAControl0 = function () {
    return ((this.sourceControl & 0x1) << 7) | (this.destinationControl << 5);
}
GameBoyAdvanceDMA1.prototype.writeDMAControl1 = function (data) {
    data = data | 0;
    this.sourceControl = (this.sourceControl & 0x1) | ((data & 0x1) << 1);
    this.repeat = data & 0x2;
    this.is32Bit = data & 0x4;
    this.dmaType = (data >> 4) & 0x3;
    this.irqFlagging = data & 0x40;
    if ((data | 0) > 0x7F) {
        if ((this.enabled | 0) == 0) {
            this.enabled = this.DMA_ENABLE_TYPE[this.dmaType | 0] | 0;
            this.enableDMAChannel();
        }
        /*
         DMA seems to not allow changing its type while it's running.
         Some games rely on this to not have broken audio (kirby's nightmare in dreamland).
         */
    }
    else {
        this.enabled = 0;
        //this.pending = 0;
        this.DMACore.update();
    }
}
GameBoyAdvanceDMA1.prototype.readDMAControl1 = function () {
    return ((((this.enabled | 0) > 0) ? 0x80 : 0) |
            this.irqFlagging |
            (this.dmaType << 4) |
            this.is32Bit |
            this.repeat |
            (this.sourceControl >> 1));
}
GameBoyAdvanceDMA1.prototype.requestDMA = function (DMAType) {
    DMAType = DMAType | 0;
    if ((this.enabled & DMAType) > 0) {
        this.pending = DMAType | 0;
        this.DMACore.update();
    }
}
GameBoyAdvanceDMA1.prototype.enableDMAChannel = function () {
    if ((this.enabled | 0) == (this.DMA_REQUEST_TYPE.FIFO_A | 0)) {
        //Assert the FIFO A DMA request signal:
        this.DMACore.IOCore.sound.checkFIFOAPendingSignal();
        //Direct Sound DMA Hardwired To Wordcount Of 4:
        this.wordCountShadow = 0x4;
        //Destination Hardwired to 0x40000A0:
        this.destination = 0x40000A0;
        //Bit-mode Hardwired to 32-bit:
        this.is32Bit = 0x4;
    }
    else {
        if ((this.enabled | 0) == (this.DMA_REQUEST_TYPE.IMMEDIATE | 0)) {
            //Flag immediate DMA transfers for processing now:
            this.pending = this.DMA_REQUEST_TYPE.IMMEDIATE | 0;
        }
        //Shadow copy the word count:
        this.wordCountShadow = this.wordCount | 0;
    }
    //Shadow copy the source address:
    this.sourceShadow = this.source | 0;
    //Shadow copy the destination address:
    this.destinationShadow = this.destination | 0;
    //Run some DMA channel activity checks:
    this.DMACore.update();
}
GameBoyAdvanceDMA1.prototype.handleDMACopy = function () {
    //Get the addesses:
    var source = this.sourceShadow | 0;
    var destination = this.destinationShadow | 0;
    //Transfer Data:
    if ((this.is32Bit | 0) == 4) {
        //32-bit Transfer:
        this.DMACore.fetch = this.memoryAccessCache.memoryRead32(source | 0) | 0;
        this.memoryAccessCache.memoryWrite32(destination | 0, this.DMACore.fetch | 0);
        this.decrementWordCount(source | 0, destination | 0, 4);
    }
    else {
        //16-bit Transfer:
        this.DMACore.fetch = this.memoryAccessCache.memoryRead16(source | 0) | 0;
        this.memoryAccessCache.memoryWrite16(destination | 0, this.DMACore.fetch | 0);
        this.DMACore.fetch |= this.DMACore.fetch << 16;    //Mirror extreme edge case?
        this.decrementWordCount(source | 0, destination | 0, 2);
    }
}
GameBoyAdvanceDMA1.prototype.decrementWordCount = function (source, destination, transferred) {
    source = source | 0;
    destination = destination | 0;
    transferred = transferred | 0;
    //Decrement the word count:
    var wordCountShadow = ((this.wordCountShadow | 0) - 1) & 0x3FFF;
    if ((wordCountShadow | 0) == 0) {
        //DMA transfer ended, handle accordingly:
        wordCountShadow = this.finalizeDMA(source | 0, destination | 0, transferred | 0) | 0;
    }
    else {
        //Update addresses:
        this.incrementDMAAddresses(source | 0, destination | 0, transferred | 0);
    }
    //Save the new word count:
    this.wordCountShadow = wordCountShadow | 0;
}
GameBoyAdvanceDMA1.prototype.finalizeDMA = function (source, destination, transferred) {
    source = source | 0;
    destination = destination | 0;
    transferred = transferred | 0;
    var wordCountShadow = 0;
    //Reset pending requests:
    this.pending = 0;
    //Check Repeat Status:
    if ((this.repeat | 0) == 0 || (this.enabled | 0) == (this.DMA_REQUEST_TYPE.IMMEDIATE | 0)) {
        //Disable the enable bit:
        this.enabled = 0;
    }
    else {
        //Repeating the dma:
        if ((this.enabled | 0) == (this.DMA_REQUEST_TYPE.FIFO_A | 0)) {
            //Assert the FIFO A DMA request signal:
            this.DMACore.IOCore.sound.checkFIFOAPendingSignal();
            //Direct Sound DMA Hardwired To Wordcount Of 4:
            wordCountShadow = 0x4;
        }
        else {
            //Reload word count:
            wordCountShadow = this.wordCount | 0;
        }
    }
    //Run the DMA channel checks:
    this.DMACore.update();
    //Check to see if we should flag for IRQ:
    this.checkIRQTrigger();
    //Update addresses:
    this.finalDMAAddresses(source | 0, destination | 0, transferred | 0);
    return wordCountShadow | 0;
}
GameBoyAdvanceDMA1.prototype.checkIRQTrigger = function () {
    if ((this.irqFlagging | 0) == 0x40) {
        this.DMACore.IOCore.irq.requestIRQ(0x200);
    }
}
GameBoyAdvanceDMA1.prototype.finalDMAAddresses = function (source, destination, transferred) {
    source = source | 0;
    destination = destination | 0;
    transferred = transferred | 0;
    //Update source address:
    switch (this.sourceControl | 0) {
        case 0:    //Increment
        case 3:    //Forbidden (VBA has it increment)
            this.sourceShadow = ((source | 0) + (transferred | 0)) | 0;
            break;
        case 1:    //Decrement
            this.sourceShadow = ((source | 0) - (transferred | 0)) | 0;
    }
    //Don't update destination if in FIFO DMA mode:
    if ((this.enabled | 0) != (this.DMA_REQUEST_TYPE.FIFO_A | 0)) {
        //Update destination address:
        switch (this.destinationControl | 0) {
            case 0:    //Increment
                this.destinationShadow = ((destination | 0) + (transferred | 0)) | 0;
                break;
            case 1:    //Decrement
                this.destinationShadow = ((destination | 0) - (transferred | 0)) | 0;
                break;
            case 3:    //Reload
                this.destinationShadow = this.destination | 0;
        }
    }
}
GameBoyAdvanceDMA1.prototype.incrementDMAAddresses = function (source, destination, transferred) {
    source = source | 0;
    destination = destination | 0;
    transferred = transferred | 0;
    //Update source address:
    switch (this.sourceControl | 0) {
        case 0:    //Increment
        case 3:    //Forbidden (VBA has it increment)
            this.sourceShadow = ((source | 0) + (transferred | 0)) | 0;
            break;
        case 1:
            this.sourceShadow = ((source | 0) - (transferred | 0)) | 0;
    }
    //Don't update destination if in FIFO DMA mode:
    if ((this.enabled | 0) != (this.DMA_REQUEST_TYPE.FIFO_A | 0)) {
        //Update destination address:
        switch (this.destinationControl | 0) {
            case 0:    //Increment
            case 3:    //Increment
                this.destinationShadow = ((destination | 0) + (transferred | 0)) | 0;
                break;
            case 1:    //Decrement
                this.destinationShadow = ((destination | 0) - (transferred | 0)) | 0;
        }
    }
}
GameBoyAdvanceDMA1.prototype.nextEventTime = function () {
    var clocks = -1;
    switch (this.enabled | 0) {
            //V_BLANK
        case 0x2:
            clocks = this.DMACore.IOCore.gfx.nextVBlankEventTime() | 0;
            break;
            //H_BLANK:
        case 0x4:
            clocks = this.DMACore.IOCore.gfx.nextHBlankDMAEventTime() | 0;
            break;
            //FIFO_A:
        case 0x8:
            clocks = this.DMACore.IOCore.sound.nextFIFOAEventTime() | 0;
    }
    return clocks | 0;
}
GameBoyAdvanceDMA1.prototype.nextIRQEventTime = function () {
    var clocks = -1;
    if ((this.irqFlagging | 0) == 0x40) {
        clocks = this.nextEventTime() | 0;
    }
    return clocks | 0;
}