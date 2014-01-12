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
function GameBoyAdvanceCPU(IOCore) {
    this.IOCore = IOCore;
    this.memory = this.IOCore.memory;
    this.settings = this.IOCore.settings;
    this.wait = this.IOCore.wait;
    this.mul64ResultHigh = 0;    //Scratch MUL64.
    this.mul64ResultLow = 0;    //Scratch MUL64.
    this.initialize();
}
GameBoyAdvanceCPU.prototype.initialize = function () {
    this.initializeRegisters();
    this.ARM = new ARMInstructionSet(this);
    this.THUMB = new THUMBInstructionSet(this);
    this.swi = new GameBoyAdvanceSWI(this);
    this.dynarec = new DynarecBranchListenerCore(this);
    this.instructionHandle = this.ARM;
    this.calculateMUL32 = (!!Math.imul) ? this.calculateMUL32Fast : this.calculateMUL32Slow;
    this.stackMemoryCache = new GameBoyAdvanceMemoryCache(this.IOCore.memory);
}
GameBoyAdvanceCPU.prototype.initializeRegisters = function () {
    /*
        R0-R7 Are known as the low registers.
        R8-R12 Are the high registers.
        R13 is the stack pointer.
        R14 is the link register.
        R15 is the program counter.
        CPSR is the program status register.
        SPSR is the saved program status register.
    */
    //Normal R0-R15 Registers:
    this.registers = getInt32Array(16);
    //Used to copy back the R8-R14 state for normal operations:
    this.registersUSR = getInt32Array(7);
    //Fast IRQ mode registers (R8-R14):
    this.registersFIQ = getInt32Array(7);
    //Supervisor mode registers (R13-R14):
    this.registersSVC = getInt32Array(2);
    //Abort mode registers (R13-R14):
    this.registersABT = getInt32Array(2);
    //IRQ mode registers (R13-R14):
    this.registersIRQ = getInt32Array(2);
    //Undefined mode registers (R13-R14):
    this.registersUND = getInt32Array(2);
    //CPSR Register:
    this.CPSR = new ARMCPSRAttributeTable();
    this.IRQDisabled = true;        //I Bit
    this.FIQDisabled = true;        //F Bit
    this.InTHUMB = false;            //T Bit
    this.MODEBits = 0x13;            //M0 thru M4 Bits
    //Banked SPSR Registers:
    this.SPSRFIQ = [false, false, false, false, true, true, false, 0x13];    //FIQ
    this.SPSRIRQ = [false, false, false, false, true, true, false, 0x13];    //IRQ
    this.SPSRSVC = [false, false, false, false, true, true, false, 0x13];    //Supervisor
    this.SPSRABT = [false, false, false, false, true, true, false, 0x13];    //Abort
    this.SPSRUND = [false, false, false, false, true, true, false, 0x13];    //Undefined
    this.triggeredIRQ = false;        //Pending IRQ found.
    this.processIRQ = false;        //Interrupt program flow for IRQ.
    this.pipelineInvalid = 0x4;        //Mark pipeline as invalid.
    //Pre-initialize stack pointers if no BIOS loaded:
    if (!this.IOCore.BIOSFound || this.IOCore.settings.SKIPBoot) {
        this.HLEReset();
    }
    //No pending interruption for dynarec:
    this.breakNormalExecution = false;
    //No pending IRQs to check for yet:
    this.executeIteration = this.executeBubble;
}
GameBoyAdvanceCPU.prototype.HLEReset = function () {
    this.registersSVC[0] = 0x3007FE0;
    this.registersIRQ[0] = 0x3007FA0;
    this.registers[13] = 0x3007F00;
    this.registers[15] = 0x8000000;
    this.MODEBits = 0x1F;
}
GameBoyAdvanceCPU.prototype.executeIRQ = function () {
    //Handle an IRQ:
    this.IRQ();
    //Execute the CPU stepping normally:
    this.executeIteration = this.executeBubble;
    this.executeBubble();
}
GameBoyAdvanceCPU.prototype.executeBubble = function () {
    //Tick the pipeline and bubble out invalidity:
    this.pipelineInvalid >>= 1;
    //Tick the pipeline of the selected instruction set:
    this.instructionHandle.executeBubble();
    //Increment the program counter if we didn't just branch:
    if ((this.pipelineInvalid | 0) < 0x4) {
        if ((this.pipelineInvalid | 0) == 1) {
            //Change state to normal execution:
            this.pipelineInvalid = 0;
            this.executeIteration = this.executeIterationRegular;
        }
        this.instructionHandle.incrementProgramCounter();
    }
}
GameBoyAdvanceCPU.prototype.executeIterationRegular = function () {
    //Tick the pipeline of the selected instruction set:
    this.instructionHandle.executeIteration();
    //Increment the program counter if we didn't just branch:
    if ((this.pipelineInvalid | 0) < 0x4) {
        this.instructionHandle.incrementProgramCounter();
    }
}
GameBoyAdvanceCPU.prototype.branch = function (branchTo) {
    branchTo = branchTo | 0;
    if ((branchTo | 0) > 0x3FFF || this.IOCore.BIOSFound) {
        //Tell the JIT information on the state before branch:
         if (this.settings.dynarecEnabled) {
            this.dynarec.listen(this.registers[15] | 0, branchTo | 0, !!this.InTHUMB);
        }
        //Branch to new address:
        this.registers[15] = branchTo | 0;
        //Mark pipeline as invalid:
        this.pipelineInvalid = 0x4;
        //Check what executor to use:
        if (this.processIRQ) {
            this.executeIteration = this.executeIRQ;
        }
        else {
            this.executeIteration = this.executeBubble;
        }
        //Next PC fetch has to update the address bus:
        this.wait.NonSequentialBroadcast();
    }
    else {
        //We're branching into BIOS, handle specially:
        if ((branchTo | 0) == 0x130) {
            //IRQ mode exit handling:
            //ROM IRQ handling returns back from its own subroutine back to BIOS at this address.
            this.HLEIRQExit();
        }
        else {
            //Reset to start of ROM if no BIOS ROM found:
            this.HLEReset();
        }
    }
}
GameBoyAdvanceCPU.prototype.triggerIRQ = function (didFire) {
    this.triggeredIRQ = didFire;
    this.assertIRQ();
}
GameBoyAdvanceCPU.prototype.assertIRQ = function () {
    this.processIRQ = this.triggeredIRQ && !this.IRQDisabled;
    if (this.processIRQ) {
        this.executeIteration = this.executeIRQ;
    }
    this.checkCPUExecutionStatus();
}
GameBoyAdvanceCPU.prototype.checkCPUExecutionStatus = function () {
    this.breakNormalExecution = ((this.IOCore.systemStatus | 0) != 0 || this.processIRQ);
}
GameBoyAdvanceCPU.prototype.getCurrentFetchValue = function () {
    return this.instructionHandle.getCurrentFetchValue() | 0;
}
GameBoyAdvanceCPU.prototype.enterARM = function () {
    this.THUMBBitModify(false);
}
GameBoyAdvanceCPU.prototype.enterTHUMB = function () {
    this.THUMBBitModify(true);
}
GameBoyAdvanceCPU.prototype.getLR = function () {
    //Get the previous instruction address:
    return this.instructionHandle.getLR() | 0;
}
GameBoyAdvanceCPU.prototype.getIRQLR = function () {
    //Get the previous instruction address:
    var lr = this.instructionHandle.getIRQLR() | 0;
    var modeOffset = (this.InTHUMB) ? 2 : 4;
    if ((this.pipelineInvalid | 0) > 1) {
        while ((this.pipelineInvalid | 0) > 1) {
            lr = ((lr | 0) + (modeOffset | 0)) | 0;
            this.pipelineInvalid >>= 1;
        }
    }
    return lr | 0;
}
GameBoyAdvanceCPU.prototype.THUMBBitModify = function (isThumb) {
    this.InTHUMB = isThumb;
    if (isThumb) {
        this.instructionHandle = this.THUMB;
    }
    else {
        this.instructionHandle = this.ARM;
    }
}
GameBoyAdvanceCPU.prototype.IRQ = function () {
    //Mode bits are set to IRQ:
    this.switchMode(0x12);
    //Save link register:
    this.registers[14] = this.getIRQLR() | 0;
    //Disable IRQ:
    this.IRQDisabled = true;
    this.processIRQ = false;
    this.checkCPUExecutionStatus();
    if (this.IOCore.BIOSFound) {
        //Exception always enter ARM mode:
        this.enterARM();
        //IRQ exception vector:
        this.branch(0x18);
    }
    else {
        //HLE the IRQ entrance:
        this.HLEIRQEnter();
    }
}
GameBoyAdvanceCPU.prototype.HLEIRQEnter = function () {
    //Exception always enter ARM mode:
    this.enterARM();
    //Get the base address:
    var currentAddress = this.registers[0xD] | 0;
    //Updating the address bus away from PC fetch:
    this.wait.NonSequentialBroadcast();
    //Push register(s) into memory:
    for (var rListPosition = 0xF; (rListPosition | 0) > -1; rListPosition = ((rListPosition | 0) - 1) | 0) {
            if ((0x500F & (1 << (rListPosition | 0))) != 0) {
                //Push a register into memory:
                currentAddress = ((currentAddress | 0) - 4) | 0;
                this.stackMemoryCache.memoryWrite32(currentAddress >>> 0, this.registers[rListPosition >>> 0] | 0);
            }
    }
    //Store the updated base address back into register:
    this.registers[0xD] = currentAddress | 0;
    //Updating the address bus back to PC fetch:
    this.wait.NonSequentialBroadcast();
    this.registers[0] = 0x4000000;
    //Save link register:
    this.registers[14] = 0x130;
    //Skip BIOS ROM processing:
    this.branch(this.read32(0x3FFFFFC) & -0x4);
}
GameBoyAdvanceCPU.prototype.HLEIRQExit = function () {
    //Get the base address:
    var currentAddress = this.registers[0xD] | 0;
    //Updating the address bus away from PC fetch:
    this.wait.NonSequentialBroadcast();
    //Load register(s) from memory:
    for (var rListPosition = 0; (rListPosition | 0) < 0x10;  rListPosition = ((rListPosition | 0) + 1) | 0) {
        if ((0x500F & (1 << (rListPosition | 0))) != 0) {
            //Load a register from memory:
            this.registers[rListPosition & 0xF] = this.stackMemoryCache.memoryRead32(currentAddress >>> 0) | 0;
            currentAddress = ((currentAddress | 0) + 4) | 0;
        }
    }
    //Store the updated base address back into register:
    this.registers[0xD] = currentAddress | 0;
    //Updating the address bus back to PC fetch:
    this.wait.NonSequentialBroadcast();
    //Return from an exception mode:
    var data = this.CPSR.setSUBFlags(this.registers[0xE] | 0, 4) | 0;
    //Restore SPSR to CPSR:
    this.SPSRtoCPSR();
    data &= (!this.InTHUMB) ? -4 : -2;
    //We performed a branch:
    this.branch(data | 0);
}
GameBoyAdvanceCPU.prototype.SWI = function () {
    if (this.IOCore.BIOSFound) {
        //Mode bits are set to SWI:
        this.switchMode(0x13);
        //Save link register:
        this.registers[14] = this.getLR() | 0;
        //Disable IRQ:
        this.IRQDisabled = true;
        this.processIRQ = false;
        this.checkCPUExecutionStatus();
        //Exception always enter ARM mode:
        this.enterARM();
        //SWI exception vector:
        this.branch(0x8);
    }
    else {
        //HLE the SWI command:
        this.swi.execute(this.read8((this.getLR() - 2) | 0));
    }
}
GameBoyAdvanceCPU.prototype.UNDEFINED = function () {
    //Only process undefined instruction if BIOS loaded:
    if (this.IOCore.BIOSFound) {
        //Mode bits are set to SWI:
        this.switchMode(0x1B);
        //Save link register:
        this.registers[14] = this.getLR() | 0;
        //Disable IRQ:
        this.IRQDisabled = true;
        this.processIRQ = false;
        this.checkCPUExecutionStatus();
        //Exception always enter ARM mode:
        this.enterARM();
        //Undefined exception vector:
        this.branch(0x4);
    }
}
GameBoyAdvanceCPU.prototype.SPSRtoCPSR = function () {
    //Used for leaving an exception and returning to the previous state:
    switch (this.MODEBits | 0) {
        case 0x11:    //FIQ
            var spsr = this.SPSRFIQ;
            break;
        case 0x12:    //IRQ
            var spsr = this.SPSRIRQ;
            break;
        case 0x13:    //Supervisor
            var spsr = this.SPSRSVC;
            break;
        case 0x17:    //Abort
            var spsr = this.SPSRABT;
            break;
        case 0x1B:    //Undefined
            var spsr = this.SPSRUND;
            break;
        default:
            return;
    }
    this.CPSR.setNegative(spsr[0]);
    this.CPSR.setZero(spsr[1]);
    this.CPSR.setOverflow(spsr[2]);
    this.CPSR.setCarry(spsr[3]);
    this.IRQDisabled = spsr[4];
    this.assertIRQ();
    this.FIQDisabled = spsr[5];
    this.THUMBBitModify(spsr[6]);
    this.switchRegisterBank(spsr[7]);
}
GameBoyAdvanceCPU.prototype.switchMode = function (newMode) {
    newMode = newMode | 0;
    this.CPSRtoSPSR(newMode | 0);
    this.switchRegisterBank(newMode | 0);
}
GameBoyAdvanceCPU.prototype.CPSRtoSPSR = function (newMode) {
    //Used for leaving an exception and returning to the previous state:
    switch (newMode | 0) {
        case 0x11:    //FIQ
            var spsr = this.SPSRFIQ;
            break;
        case 0x12:    //IRQ
            var spsr = this.SPSRIRQ;
            break;
        case 0x13:    //Supervisor
            var spsr = this.SPSRSVC;
            break;
        case 0x17:    //Abort
            var spsr = this.SPSRABT;
            break;
        case 0x1B:    //Undefined
            var spsr = this.SPSRUND;
        default:    //Any other mode does not have access here.
            return;
    }
    spsr[0] = this.CPSR.getNegative();
    spsr[1] = this.CPSR.getZero();
    spsr[2] = this.CPSR.getOverflow();
    spsr[3] = this.CPSR.getCarry();
    spsr[4] = this.IRQDisabled;
    spsr[5] = this.FIQDisabled;
    spsr[6] = this.InTHUMB;
    spsr[7] = this.MODEBits;
}
GameBoyAdvanceCPU.prototype.switchRegisterBank = function (newMode) {
    newMode = newMode | 0;
    switch (this.MODEBits | 0) {
        case 0x10:
        case 0x1F:
            this.registersUSR[0] = this.registers[8] | 0;
            this.registersUSR[1] = this.registers[9] | 0;
            this.registersUSR[2] = this.registers[10] | 0;
            this.registersUSR[3] = this.registers[11] | 0;
            this.registersUSR[4] = this.registers[12] | 0;
            this.registersUSR[5] = this.registers[13] | 0;
            this.registersUSR[6] = this.registers[14] | 0;
            break;
        case 0x11:
            this.registersFIQ[0] = this.registers[8] | 0;
            this.registersFIQ[1] = this.registers[9] | 0;
            this.registersFIQ[2] = this.registers[10] | 0;
            this.registersFIQ[3] = this.registers[11] | 0;
            this.registersFIQ[4] = this.registers[12] | 0;
            this.registersFIQ[5] = this.registers[13] | 0;
            this.registersFIQ[6] = this.registers[14] | 0;
            break;
        case 0x12:
            this.registersUSR[0] = this.registers[8] | 0;
            this.registersUSR[1] = this.registers[9] | 0;
            this.registersUSR[2] = this.registers[10] | 0;
            this.registersUSR[3] = this.registers[11] | 0;
            this.registersUSR[4] = this.registers[12] | 0;
            this.registersIRQ[0] = this.registers[13] | 0;
            this.registersIRQ[1] = this.registers[14] | 0;
            break;
        case 0x13:
            this.registersUSR[0] = this.registers[8] | 0;
            this.registersUSR[1] = this.registers[9] | 0;
            this.registersUSR[2] = this.registers[10] | 0;
            this.registersUSR[3] = this.registers[11] | 0;
            this.registersUSR[4] = this.registers[12] | 0;
            this.registersSVC[0] = this.registers[13] | 0;
            this.registersSVC[1] = this.registers[14] | 0;
            break;
        case 0x17:
            this.registersUSR[0] = this.registers[8] | 0;
            this.registersUSR[1] = this.registers[9] | 0;
            this.registersUSR[2] = this.registers[10] | 0;
            this.registersUSR[3] = this.registers[11] | 0;
            this.registersUSR[4] = this.registers[12] | 0;
            this.registersABT[0] = this.registers[13] | 0;
            this.registersABT[1] = this.registers[14] | 0;
            break;
        case 0x1B:
            this.registersUSR[0] = this.registers[8] | 0;
            this.registersUSR[1] = this.registers[9] | 0;
            this.registersUSR[2] = this.registers[10] | 0;
            this.registersUSR[3] = this.registers[11] | 0;
            this.registersUSR[4] = this.registers[12] | 0;
            this.registersUND[0] = this.registers[13] | 0;
            this.registersUND[1] = this.registers[14] | 0;
    }
    switch (newMode | 0) {
        case 0x10:
        case 0x1F:
            this.registers[8] = this.registersUSR[0] | 0;
            this.registers[9] = this.registersUSR[1] | 0;
            this.registers[10] = this.registersUSR[2] | 0;
            this.registers[11] = this.registersUSR[3] | 0;
            this.registers[12] = this.registersUSR[4] | 0;
            this.registers[13] = this.registersUSR[5] | 0;
            this.registers[14] = this.registersUSR[6] | 0;
            break;
        case 0x11:
            this.registers[8] = this.registersFIQ[0] | 0;
            this.registers[9] = this.registersFIQ[1] | 0;
            this.registers[10] = this.registersFIQ[2] | 0;
            this.registers[11] = this.registersFIQ[3] | 0;
            this.registers[12] = this.registersFIQ[4] | 0;
            this.registers[13] = this.registersFIQ[5] | 0;
            this.registers[14] = this.registersFIQ[6] | 0;
            break;
        case 0x12:
            this.registers[8] = this.registersUSR[0] | 0;
            this.registers[9] = this.registersUSR[1] | 0;
            this.registers[10] = this.registersUSR[2] | 0;
            this.registers[11] = this.registersUSR[3] | 0;
            this.registers[12] = this.registersUSR[4] | 0;
            this.registers[13] = this.registersIRQ[0] | 0;
            this.registers[14] = this.registersIRQ[1] | 0;
            break;
        case 0x13:
            this.registers[8] = this.registersUSR[0] | 0;
            this.registers[9] = this.registersUSR[1] | 0;
            this.registers[10] = this.registersUSR[2] | 0;
            this.registers[11] = this.registersUSR[3] | 0;
            this.registers[12] = this.registersUSR[4] | 0;
            this.registers[13] = this.registersSVC[0] | 0;
            this.registers[14] = this.registersSVC[1] | 0;
            break;
        case 0x17:
            this.registers[8] = this.registersUSR[0] | 0;
            this.registers[9] = this.registersUSR[1] | 0;
            this.registers[10] = this.registersUSR[2] | 0;
            this.registers[11] = this.registersUSR[3] | 0;
            this.registers[12] = this.registersUSR[4] | 0;
            this.registers[13] = this.registersABT[0] | 0;
            this.registers[14] = this.registersABT[1] | 0;
            break;
        case 0x1B:
            this.registers[8] = this.registersUSR[0] | 0;
            this.registers[9] = this.registersUSR[1] | 0;
            this.registers[10] = this.registersUSR[2] | 0;
            this.registers[11] = this.registersUSR[3] | 0;
            this.registers[12] = this.registersUSR[4] | 0;
            this.registers[13] = this.registersUND[0] | 0;
            this.registers[14] = this.registersUND[1] | 0;
    }
    this.MODEBits = newMode | 0;
}
GameBoyAdvanceCPU.prototype.calculateMUL32Slow = function (rs, rd) {
    rs = rs | 0;
    rd = rd | 0;
    /*
     We have to split up the 32 bit multiplication,
     as JavaScript does multiplication on the FPU
     as double floats, which drops the low bits
     rather than the high bits.
     */
    var lowMul = (rs & 0xFFFF) * rd;
    var highMul = (rs >> 16) * rd;
    //Cut off bits above bit 31 and return with proper sign:
    return ((highMul << 16) + lowMul) | 0;
}
GameBoyAdvanceCPU.prototype.calculateMUL32Fast = function (rs, rd) {
    rs = rs | 0;
    rd = rd | 0;
    //Used a proposed non-legacy extension that can do 32 bit signed multiplication:
    return Math.imul(rs | 0, rd | 0) | 0;
}
GameBoyAdvanceCPU.prototype.performMUL32 = function (rs, rd, MLAClocks) {
    rs = rs | 0;
    rd = rd | 0;
    MLAClocks = MLAClocks | 0;
    //Predict the internal cycle time:
    if ((rd >>> 8) == 0 || (rd >>> 8) == 0xFFFFFF) {
        this.IOCore.wait.CPUInternalCyclePrefetch((1 + (MLAClocks | 0)) | 0);
    }
    else if ((rd >>> 16) == 0 || (rd >>> 16) == 0xFFFF) {
        this.IOCore.wait.CPUInternalCyclePrefetch((2 + (MLAClocks | 0)) | 0);
    }
    else if ((rd >>> 24) == 0 || (rd >>> 24) == 0xFF) {
        this.IOCore.wait.CPUInternalCyclePrefetch((3 + (MLAClocks | 0)) | 0);
    }
    else {
        this.IOCore.wait.CPUInternalCyclePrefetch((4 + (MLAClocks | 0)) | 0);
    }
    return this.calculateMUL32(rs | 0, rd | 0) | 0;
}
GameBoyAdvanceCPU.prototype.performMUL64 = function (rs, rd) {
    rs = rs | 0;
    rd = rd | 0;
    //Predict the internal cycle time:
    if ((rd >>> 8) == 0 || (rd >>> 8) == 0xFFFFFF) {
        this.IOCore.wait.CPUInternalCyclePrefetch(2);
    }
    else if ((rd >>> 16) == 0 || (rd >>> 16) == 0xFFFF) {
        this.IOCore.wait.CPUInternalCyclePrefetch(3);
    }
    else if ((rd >>> 24) == 0 || (rd >>> 24) == 0xFF) {
        this.IOCore.wait.CPUInternalCyclePrefetch(4);
    }
    else {
        this.IOCore.wait.CPUInternalCyclePrefetch(5);
    }
    //Solve for the high word (Do FPU double divide to bring down high word into the low word):
    this.mul64ResultHigh = ((rs * rd) / 0x100000000) | 0;
    this.mul64ResultLow = this.calculateMUL32(rs | 0, rd | 0) | 0;
}
GameBoyAdvanceCPU.prototype.performMLA64 = function (rs, rd, mlaHigh, mlaLow) {
    rs = rs | 0;
    rd = rd | 0;
    mlaHigh = mlaHigh | 0;
    mlaLow = mlaLow | 0;
    //Predict the internal cycle time:
    if ((rd >>> 8) == 0 || (rd >>> 8) == 0xFFFFFF) {
        this.IOCore.wait.CPUInternalCyclePrefetch(3);
    }
    else if ((rd >>> 16) == 0 || (rd >>> 16) == 0xFFFF) {
        this.IOCore.wait.CPUInternalCyclePrefetch(4);
    }
    else if ((rd >>> 24) == 0 || (rd >>> 24) == 0xFF) {
        this.IOCore.wait.CPUInternalCyclePrefetch(5);
    }
    else {
        this.IOCore.wait.CPUInternalCyclePrefetch(6);
    }
    //Solve for the high word (Do FPU double divide to bring down high word into the low word):
    this.mul64ResultHigh = ((((rs * rd) + (mlaLow >>> 0)) / 0x100000000) + (mlaHigh >>> 0)) | 0;
    /*
        We have to split up the 64 bit multiplication,
        as JavaScript does multiplication on the FPU
        as double floats, which drops the low bits
        rather than the high bits.
    */
    var lowMul = (rs & 0xFFFF) * rd;
    var highMul = (rs >> 16) * rd;
    //Cut off bits above bit 31 and return with proper sign:
    this.mul64ResultLow = (((highMul << 16) >>> 0) + (lowMul >>> 0) + (mlaLow >>> 0)) | 0;
}
GameBoyAdvanceCPU.prototype.performUMUL64 = function (rs, rd) {
    rs = rs | 0;
    rd = rd | 0;
    //Predict the internal cycle time:
    if ((rd >>> 8) == 0) {
        this.IOCore.wait.CPUInternalCyclePrefetch(2);
    }
    else if ((rd >>> 16) == 0) {
        this.IOCore.wait.CPUInternalCyclePrefetch(3);
    }
    else if ((rd >>> 24) == 0) {
        this.IOCore.wait.CPUInternalCyclePrefetch(4);
    }
    else {
        this.IOCore.wait.CPUInternalCyclePrefetch(5);
    }
    //Type convert to uint32:
    rs >>>= 0;
    rd >>>= 0;
    //Solve for the high word (Do FPU double divide to bring down high word into the low word):
    this.mul64ResultHigh = ((rs * rd) / 0x100000000) | 0;
    /*
        We have to split up the 64 bit multiplication,
        as JavaScript does multiplication on the FPU
        as double floats, which drops the low bits
        rather than the high bits.
    */
    var lowMul = (rs & 0xFFFF) * rd;
    var highMul = (rs >> 16) * rd;
    //Cut off bits above bit 31 and return with proper sign:
    this.mul64ResultLow = ((highMul << 16) + lowMul) | 0;
}
GameBoyAdvanceCPU.prototype.performUMLA64 = function (rs, rd, mlaHigh, mlaLow) {
    rs = rs | 0;
    rd = rd | 0;
    mlaHigh = mlaHigh | 0;
    mlaLow = mlaLow | 0;
    //Predict the internal cycle time:
    if ((rd >>> 8) == 0) {
        this.IOCore.wait.CPUInternalCyclePrefetch(3);
    }
    else if ((rd >>> 16) == 0) {
        this.IOCore.wait.CPUInternalCyclePrefetch(4);
    }
    else if ((rd >>> 24) == 0) {
        this.IOCore.wait.CPUInternalCyclePrefetch(5);
    }
    else {
        this.IOCore.wait.CPUInternalCyclePrefetch(6);
    }
    //Type convert to uint32:
    rs >>>= 0;
    rd >>>= 0;
    //Solve for the high word (Do FPU double divide to bring down high word into the low word):
    this.mul64ResultHigh = ((((rs * rd) + mlaLow) / 0x100000000) + mlaHigh) | 0;
    /*
        We have to split up the 64 bit multiplication,
        as JavaScript does multiplication on the FPU
        as double floats, which drops the low bits
        rather than the high bits.
    */
    var lowMul = (rs & 0xFFFF) * rd;
    var highMul = (rs >> 16) * rd;
    //Cut off bits above bit 31 and return with proper sign:
    this.mul64ResultLow = ((highMul << 16) + lowMul + mlaLow) | 0;
}
GameBoyAdvanceCPU.prototype.write32 = function (address, data) {
    address = address | 0;
    data = data | 0;
    //Updating the address bus away from PC fetch:
    this.IOCore.wait.NonSequentialBroadcast();
    this.memory.memoryWrite32(address >>> 0, data | 0);
    //Updating the address bus back to PC fetch:
    this.IOCore.wait.NonSequentialBroadcast();
}
GameBoyAdvanceCPU.prototype.write16 = function (address, data) {
    address = address | 0;
    data = data | 0;
    //Updating the address bus away from PC fetch:
    this.IOCore.wait.NonSequentialBroadcast();
    this.memory.memoryWrite16(address >>> 0, data | 0);
    //Updating the address bus back to PC fetch:
    this.IOCore.wait.NonSequentialBroadcast();
}
GameBoyAdvanceCPU.prototype.write8 = function (address, data) {
    address = address | 0;
    data = data | 0;
    //Updating the address bus away from PC fetch:
    this.IOCore.wait.NonSequentialBroadcast();
    this.memory.memoryWriteFast8(address >>> 0, data | 0);
    //Updating the address bus back to PC fetch:
    this.IOCore.wait.NonSequentialBroadcast();
}
GameBoyAdvanceCPU.prototype.read32 = function (address) {
    address = address | 0;
    //Updating the address bus away from PC fetch:
    this.IOCore.wait.NonSequentialBroadcast();
    var data = this.memory.memoryRead32(address >>> 0) | 0;
    //Unaligned access gets data rotated right:
    if ((address & 0x3) != 0) {
        //Rotate word right:
        data = (data << ((4 - (address & 0x3)) << 3)) | (data >>> ((address & 0x3) << 3));
    }
    //Updating the address bus back to PC fetch:
    this.IOCore.wait.NonSequentialBroadcast();
    return data | 0;
}
GameBoyAdvanceCPU.prototype.read16 = function (address) {
    address = address | 0;
    //Updating the address bus away from PC fetch:
    this.IOCore.wait.NonSequentialBroadcast();
    var data = this.memory.memoryRead16(address >>> 0) | 0;
    //Updating the address bus back to PC fetch:
    this.IOCore.wait.NonSequentialBroadcast();
    return data | 0;
}
GameBoyAdvanceCPU.prototype.read8 = function (address) {
    address = address | 0;
    //Updating the address bus away from PC fetch:
    this.IOCore.wait.NonSequentialBroadcast();
    var data = this.memory.memoryReadFast8(address >>> 0) | 0;
    //Updating the address bus back to PC fetch:
    this.IOCore.wait.NonSequentialBroadcast();
    return data | 0;
}