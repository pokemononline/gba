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
function GameBoyAdvanceIO(settings, coreExposed, BIOS, ROM) {
    //State Machine Tracking:
    this.systemStatus = 0;
    this.cyclesToIterate = 0;
    this.cyclesOveriteratedPreviously = 0;
    this.accumulatedClocks = 0;
    this.graphicsClocks = 0;
    this.timerClocks = 0;
    this.serialClocks = 0;
    this.nextEventClocks = 0;
    this.BIOSFound = false;
    //References passed to us:
    this.settings = settings;
    this.coreExposed = coreExposed;
    this.BIOS = BIOS;
    this.ROM = ROM;
    //Initialize the various handler objects:
    this.memory = new GameBoyAdvanceMemory(this);
    this.dma = new GameBoyAdvanceDMA(this);
    this.gfx = new GameBoyAdvanceGraphics(this);
    this.sound = new GameBoyAdvanceSound(this);
    this.timer = new GameBoyAdvanceTimer(this);
    this.irq = new GameBoyAdvanceIRQ(this);
    this.serial = new GameBoyAdvanceSerial(this);
    this.joypad = new GameBoyAdvanceJoyPad(this);
    this.cartridge = new GameBoyAdvanceCartridge(this);
    this.saves = new GameBoyAdvanceSaves(this);
    this.wait = new GameBoyAdvanceWait(this);
    this.cpu = new GameBoyAdvanceCPU(this);
    this.memory.loadReferences();
}
GameBoyAdvanceIO.prototype.iterate = function (CPUCyclesTotal) {
    //Find out how many clocks to iterate through this run:
    this.cyclesToIterate = ((CPUCyclesTotal | 0) + (this.cyclesOveriteratedPreviously | 0)) | 0;
    //An extra check to make sure we don't do stuff if we did too much last run:
    if ((this.cyclesToIterate | 0) > 0) {
        //Update our core event prediction:
        this.updateCoreEventTime();
        //If clocks remaining, run iterator:
        this.runIterator();
        //Spill our core event clocking:
        this.updateCoreClocking();
        //Ensure audio buffers at least once per iteration:
        this.sound.audioJIT();
    }
    //If we clocked just a little too much, subtract the extra from the next run:
    this.cyclesOveriteratedPreviously = this.cyclesToIterate | 0;
}
GameBoyAdvanceIO.prototype.runIterator = function () {
    //Clock through the state machine:
    while (true) {
        //Handle the current system state selected:
        switch (this.systemStatus | 0) {
            case 0: //CPU Handle State (Normal)
                this.cpu.executeIterationRegular();
                break;
            case 1: //CPU Handle State (Bubble)
                this.cpu.executeBubble();
                break;
            case 2: //CPU Handle State (IRQ)
            case 3:
                this.cpu.executeIRQ();
                break;
            case 4: //DMA Handle State
            case 5:
            case 6:
            case 7:
            case 12: //DMA Inside Halt State
            case 13:
            case 14:
            case 15:
                this.dma.perform();
                break;
            case 8: //Handle Halt State
            case 9:
            case 10:
            case 11:
                this.handleHalt();
                break;
            default: //Handle Stop State / End of stepping
                if ((this.systemStatus | 0) >= 0x20) {
                    //End of Stepping:
                    this.deflagStepper(0x20);
                    return;
                }
                //Stop Mode:
                this.handleStop();
        }
    }
}
GameBoyAdvanceIO.prototype.updateCore = function (clocks) {
    clocks = clocks | 0;
    //This is used during normal/dma modes of operation:
    this.accumulatedClocks = ((this.accumulatedClocks | 0) + (clocks | 0)) | 0;
    if ((this.accumulatedClocks | 0) >= (this.nextEventClocks | 0)) {
        this.updateCoreSpill();
    }
}
GameBoyAdvanceIO.prototype.updateCoreSingle = function () {
    //This is used during normal/dma modes of operation:
    this.accumulatedClocks = ((this.accumulatedClocks | 0) + 1) | 0;
    if ((this.accumulatedClocks | 0) >= (this.nextEventClocks | 0)) {
        this.updateCoreSpill();
    }
}
GameBoyAdvanceIO.prototype.updateCoreTwice = function () {
    //This is used during normal/dma modes of operation:
    this.accumulatedClocks = ((this.accumulatedClocks | 0) + 2) | 0;
    if ((this.accumulatedClocks | 0) >= (this.nextEventClocks | 0)) {
        this.updateCoreSpill();
    }
}
GameBoyAdvanceIO.prototype.updateCoreSpill = function () {
    this.updateCoreClocking();
    this.updateCoreEventTime();
}
GameBoyAdvanceIO.prototype.updateCoreSpillRetain = function () {
    //Keep the last prediction, just decrement it out, as it's still valid:
    this.nextEventClocks = ((this.nextEventClocks | 0) - (this.accumulatedClocks | 0)) | 0;
    this.updateCoreClocking();
}
GameBoyAdvanceIO.prototype.updateCoreClocking = function () {
    var clocks = this.accumulatedClocks | 0;
    //Decrement the clocks per iteration counter:
    this.cyclesToIterate = ((this.cyclesToIterate | 0) - (clocks | 0)) | 0;
    //Clock all components:
    this.gfx.addClocks(((clocks | 0) - (this.graphicsClocks | 0)) | 0);
    this.timer.addClocks(((clocks | 0) - (this.timerClocks | 0)) | 0);
    this.serial.addClocks(((clocks | 0) - (this.serialClocks | 0)) | 0);
    this.accumulatedClocks = 0;
    this.graphicsClocks = 0;
    this.timerClocks = 0;
    this.serialClocks = 0;
}
GameBoyAdvanceIO.prototype.updateGraphicsClocking = function () {
    //Clock gfx component:
    this.gfx.addClocks(((this.accumulatedClocks | 0)  - (this.graphicsClocks | 0)) | 0);
    this.graphicsClocks = this.accumulatedClocks | 0;
}
GameBoyAdvanceIO.prototype.updateTimerClocking = function () {
    //Clock timer component:
    this.timer.addClocks(((this.accumulatedClocks | 0)  - (this.timerClocks | 0)) | 0);
    this.timerClocks = this.accumulatedClocks | 0;
}
GameBoyAdvanceIO.prototype.updateSerialClocking = function () {
    //Clock serial component:
    this.serial.addClocks(((this.accumulatedClocks | 0)  - (this.serialClocks | 0)) | 0);
    this.serialClocks = this.accumulatedClocks | 0;
}
GameBoyAdvanceIO.prototype.updateCoreEventTime = function () {
    //Predict how many clocks until the next DMA or IRQ event:
    this.nextEventClocks = this.cyclesUntilNextEvent() | 0;
}
GameBoyAdvanceIO.prototype.getRemainingCycles = function () {
    //Return the number of cycles left until iteration end:
    if ((this.cyclesToIterate | 0) <= 0) {
        //Change our stepper to our end sequence:
        this.flagStepper(0x20);
        return 0;
    }
    return this.cyclesToIterate | 0;
}
GameBoyAdvanceIO.prototype.handleHalt = function () {
    if (!this.irq.IRQMatch()) {
        //Clock up to next IRQ match or DMA:
        this.updateCore(this.cyclesUntilNextHALTEvent() | 0);
    }
    else {
        //Exit HALT promptly:
        this.deflagStepper(0x8);
    }
}
GameBoyAdvanceIO.prototype.handleStop = function () {
    //Update sound system to add silence to buffer:
    this.sound.addClocks(this.getRemainingCycles() | 0);
    this.cyclesToIterate = 0;
    //Exits when user presses joypad or from an external irq outside of GBA internal.
}
GameBoyAdvanceIO.prototype.cyclesUntilNextHALTEvent = function () {
    //Find the clocks to the next HALT leave or DMA event:
    var haltClocks = this.irq.nextEventTime() | 0;
    var dmaClocks = this.dma.nextEventTime() | 0;
    return this.solveClosestTime(haltClocks | 0, dmaClocks | 0) | 0;
}
GameBoyAdvanceIO.prototype.cyclesUntilNextEvent = function () {
    //Find the clocks to the next IRQ or DMA event:
    var irqClocks = this.irq.nextIRQEventTime() | 0;
    var dmaClocks = this.dma.nextEventTime() | 0;
    return this.solveClosestTime(irqClocks | 0, dmaClocks | 0) | 0;
}
GameBoyAdvanceIO.prototype.solveClosestTime = function (clocks1, clocks2) {
    clocks1 = clocks1 | 0;
    clocks2 = clocks2 | 0;
    //Find the clocks closest to the next event:
    var clocks = this.getRemainingCycles() | 0;
    if ((clocks1 | 0) >= 0) {
        if ((clocks2 | 0) >= 0) {
            clocks = Math.min(clocks | 0, clocks1 | 0, clocks2 | 0) | 0;
        }
        else {
            clocks = Math.min(clocks | 0, clocks1 | 0) | 0;
        }
    }
    else if (clocks2 >= 0) {
        clocks = Math.min(clocks | 0, clocks2 | 0) | 0;
    }
    return clocks | 0;
}
GameBoyAdvanceIO.prototype.deflagStepper = function (statusFlag) {
    statusFlag = statusFlag | 0;
    //Deflag a system event to step through:
    this.systemStatus = this.systemStatus & (~statusFlag);
}
GameBoyAdvanceIO.prototype.flagStepper = function (statusFlag) {
    statusFlag = statusFlag | 0;
    //Flag a system event to step through:
    this.systemStatus = this.systemStatus | statusFlag;
}