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
function ARMInstructionSet(CPUCore) {
    this.CPUCore = CPUCore;
    this.initialize();
}
ARMInstructionSet.prototype.initialize = function () {
    this.wait = this.CPUCore.wait;
    this.registers = this.CPUCore.registers;
    this.registersUSR = this.CPUCore.registersUSR;
    this.CPSR = this.CPUCore.CPSR;
    this.fetch = 0;
    this.decode = 0;
    this.execute = 0;
    this.stackMemoryCache = new GameBoyAdvanceMemoryCache(this.CPUCore.memory);
    this.compileReducedInstructionMap(this.compileInstructionMap());
}
ARMInstructionSet.prototype.executeIteration = function () {
    //Push the new fetch access:
    this.fetch = this.wait.CPUGetOpcode32(this.readPC() | 0) | 0;
    //Execute Conditional Instruction:
    this.instructionMap[((this.execute >> 16) & 0xFFF0) | ((this.execute >> 4) & 0xF)]();
    //Update the pipelining state:
    this.execute = this.decode | 0;
    this.decode = this.fetch | 0;
}
ARMInstructionSet.prototype.executeBubble = function () {
    //Push the new fetch access:
    this.fetch = this.wait.CPUGetOpcode32(this.readPC() | 0) | 0;
    //Update the pipelining state:
    this.execute = this.decode | 0;
    this.decode = this.fetch | 0;
}
ARMInstructionSet.prototype.incrementProgramCounter = function () {
    //Increment The Program Counter:
    this.registers[15] = ((this.registers[15] | 0) + 4) | 0;
}
ARMInstructionSet.prototype.getLR = function () {
    return ((this.readPC() | 0) - 4) | 0;
}
ARMInstructionSet.prototype.getIRQLR = function () {
    return this.getLR() | 0;
}
ARMInstructionSet.prototype.getCurrentFetchValue = function () {
    return this.fetch | 0;
}
ARMInstructionSet.prototype.writeRegister = function (address, data) {
    //Unguarded non-pc register write:
    address = address | 0;
    data = data | 0;
    this.registers[address & 0xF] = data | 0;
}
ARMInstructionSet.prototype.writeUserRegister = function (address, data) {
    //Unguarded non-pc user mode register write:
    address = address | 0;
    data = data | 0;
    this.registersUSR[address & 0x7] = data | 0;
}
ARMInstructionSet.prototype.guardRegisterWrite = function (address, data) {
    //Guarded register write:
    address = address | 0;
    data = data | 0;
    if ((address | 0) < 0xF) {
        //Non-PC Write:
        this.writeRegister(address | 0, data | 0);
    }
    else {
        //We performed a branch:
        this.CPUCore.branch(data & -4);
    }
}
ARMInstructionSet.prototype.guard12OffsetRegisterWrite = function (data) {
    data = data | 0;
    this.guardRegisterWrite((this.execute >> 0xC) & 0xF, data | 0);
}
ARMInstructionSet.prototype.guard16OffsetRegisterWrite = function (data) {
    data = data | 0;
    this.guardRegisterWrite((this.execute >> 0x10) & 0xF, data | 0);
}
ARMInstructionSet.prototype.guardProgramCounterRegisterWriteCPSR = function (data) {
    data = data | 0;
    //Restore SPSR to CPSR:
    this.CPUCore.SPSRtoCPSR();
    data &= (!this.CPUCore.InTHUMB) ? -4 : -2;
    //We performed a branch:
    this.CPUCore.branch(data | 0);
}
ARMInstructionSet.prototype.guardRegisterWriteCPSR = function (address, data) {
    //Guard for possible pc write with cpsr update:
    address = address | 0;
    data = data | 0;
    if ((address | 0) < 0xF) {
        //Non-PC Write:
        this.writeRegister(address | 0, data | 0);
    }
    else {
        //Restore SPSR to CPSR:
        this.guardProgramCounterRegisterWriteCPSR(data | 0);
    }
}
ARMInstructionSet.prototype.guard12OffsetRegisterWriteCPSR = function (data) {
    data = data | 0;
    this.guardRegisterWriteCPSR((this.execute >> 0xC) & 0xF, data | 0);
}
ARMInstructionSet.prototype.guard16OffsetRegisterWriteCPSR = function (data) {
    data = data | 0;
    this.guardRegisterWriteCPSR((this.execute >> 0x10) & 0xF, data | 0);
}
ARMInstructionSet.prototype.guardUserRegisterWrite = function (address, data) {
    //Guard only on user access, not PC!:
    address = address | 0;
    data = data | 0;
    switch (this.CPUCore.MODEBits | 0) {
        case 0x10:
        case 0x1F:
            this.writeRegister(address | 0, data | 0);
            break;
        case 0x11:
            if ((address | 0) < 8) {
                this.writeRegister(address | 0, data | 0);
            }
            else {
                //User-Mode Register Write Inside Non-User-Mode:
                this.writeUserRegister(address | 0, data | 0);
            }
            break;
        default:
            if ((address | 0) < 13) {
                this.writeRegister(address | 0, data | 0);
            }
            else {
                //User-Mode Register Write Inside Non-User-Mode:
                this.writeUserRegister(address | 0, data | 0);
            }
    }
}
ARMInstructionSet.prototype.guardRegisterWriteLDM = function (parentObj, address, data) {
    //Proxy guarded register write for LDM:
    address = address | 0;
    data = data | 0;
    parentObj.guardRegisterWrite(address | 0, data | 0);
}
ARMInstructionSet.prototype.guardUserRegisterWriteLDM = function (parentObj, address, data) {
    //Proxy guarded user mode register write with PC guard for LDM:
    address = address | 0;
    data = data | 0;
    if ((address | 0) < 0xF) {
        if ((parentObj.execute & 0x8000) == 0x8000) {
            //PC is going to be loaded, don't do user-mode:
            parentObj.guardRegisterWrite(address | 0, data | 0);
        }
        else {
            //PC isn't in the list, do user-mode:
            parentObj.guardUserRegisterWrite(address | 0, data | 0);
        }
    }
    else {
        parentObj.guardProgramCounterRegisterWriteCPSR(data | 0);
    }
}
ARMInstructionSet.prototype.baseRegisterWrite = function (address, data, userMode) {
    //Update writeback for offset+base modes:
    address = address | 0;
    data = data | 0;
    if (!userMode || (address | 0) == 0xF) {
        this.guardRegisterWrite(address | 0, data | 0);
    }
    else {
        this.guardUserRegisterWrite(address | 0, data | 0);
    }
}
ARMInstructionSet.prototype.readPC = function () {
    //PC register read:
    return this.registers[0xF] | 0;
}
ARMInstructionSet.prototype.readRegister = function (address) {
    //Unguarded register read:
    address = address | 0;
    return this.registers[address & 0xF] | 0;
}
ARMInstructionSet.prototype.readUserRegister = function (address) {
    //Unguarded user mode register read:
    address = address | 0;
    return this.registersUSR[address & 0x7] | 0;
}
ARMInstructionSet.prototype.readDelayedPCRegister = function () {
    //Get the PC register data clocked 4 exta:
    var register = this.registers[0xF] | 0;
    register = ((register | 0) + 4) | 0;
    return register | 0;
}
ARMInstructionSet.prototype.read0OffsetRegister = function () {
    //Unguarded register read at position 0:
    return this.readRegister(this.execute | 0) | 0;
}
ARMInstructionSet.prototype.read8OffsetRegister = function () {
    //Unguarded register read at position 0x8:
    return this.readRegister(this.execute >> 0x8) | 0;
}
ARMInstructionSet.prototype.read12OffsetRegister = function () {
    //Unguarded register read at position 0xC:
    return this.readRegister(this.execute >> 0xC) | 0;
}
ARMInstructionSet.prototype.read16OffsetRegister = function () {
    //Unguarded register read at position 0x10:
    return this.readRegister(this.execute >> 0x10) | 0;
}
ARMInstructionSet.prototype.readGuarded16OffsetRegister = function () {
    //Guarded register read at position 0x10:
    return this.guardRegisterRead((this.execute >> 0x10) & 0xF) | 0;
}
ARMInstructionSet.prototype.guardRegisterRead = function (address) {
    //Guarded register read:
    address = address | 0;
    if ((address | 0) < 0xF) {
        return this.readRegister(address | 0) | 0;
    }
    //Get Special Case PC Read:
    return this.readDelayedPCRegister() | 0;
}
ARMInstructionSet.prototype.guardUserRegisterRead = function (address) {
    //Guard only on user access, not PC!:
    address = address | 0;
    switch (this.CPUCore.MODEBits | 0) {
        case 0x10:
        case 0x1F:
            return this.readRegister(address | 0) | 0;
        case 0x11:
            if ((address | 0) < 8) {
                return this.readRegister(address | 0) | 0;
            }
            else {
                //User-Mode Register Read Inside Non-User-Mode:
                return this.readUserRegister(address | 0) | 0;
            }
            break;
        default:
            if ((address | 0) < 13) {
                return this.readRegister(address | 0) | 0;
            }
            else {
                //User-Mode Register Read Inside Non-User-Mode:
                return this.readUserRegister(address | 0) | 0;
            }
    }
}
ARMInstructionSet.prototype.guardRegisterReadSTM = function (parentObj, address) {
    //Proxy guarded register read (used by STM*):
    address = address | 0;
    return parentObj.guardRegisterRead(address | 0) | 0;
}
ARMInstructionSet.prototype.guardUserRegisterReadSTM = function (parentObj, address) {
    //Proxy guarded user mode read (used by STM*):
    address = address | 0;
    if ((address | 0) < 0xF) {
        return parentObj.guardUserRegisterRead(address | 0) | 0;
    }
    else {
        //Get Special Case PC Read:
        return parentObj.readDelayedPCRegister() | 0;
    }
}
ARMInstructionSet.prototype.baseRegisterRead = function (address, userMode) {
    //Read specially for offset+base modes:
    address = address | 0;
    if (!userMode || (address | 0) == 0xF) {
        return this.readRegister(address | 0) | 0;
    }
    else {
        return this.guardUserRegisterRead(address | 0) | 0;
    }
}
ARMInstructionSet.prototype.updateBasePostDecrement = function (operand, offset, userMode) {
    operand = operand | 0;
    offset = offset | 0;
    var baseRegisterNumber = (operand >> 16) & 0xF;
    var base = this.baseRegisterRead(baseRegisterNumber | 0, userMode) | 0;
    var result = ((base | 0) - (offset | 0)) | 0;
    this.baseRegisterWrite(baseRegisterNumber | 0, result | 0, userMode);
    return base | 0;
}
ARMInstructionSet.prototype.updateBasePostIncrement = function (operand, offset, userMode) {
    operand = operand | 0;
    offset = offset | 0;
    var baseRegisterNumber = (operand >> 16) & 0xF;
    var base = this.baseRegisterRead(baseRegisterNumber | 0, userMode) | 0;
    var result = ((base | 0) + (offset | 0)) | 0;
    this.baseRegisterWrite(baseRegisterNumber | 0, result | 0, userMode);
    return base | 0;
}
ARMInstructionSet.prototype.updateNoBaseDecrement = function (operand, offset) {
    operand = operand | 0;
    offset = offset | 0;
    var baseRegisterNumber = (operand >> 16) & 0xF;
    var base = this.registers[baseRegisterNumber | 0] | 0;
    var result = ((base | 0) - (offset | 0)) | 0;
    return result | 0;
}
ARMInstructionSet.prototype.updateNoBaseIncrement = function (operand, offset) {
    operand = operand | 0;
    offset = offset | 0;
    var baseRegisterNumber = (operand >> 16) & 0xF;
    var base = this.registers[baseRegisterNumber | 0] | 0;
    var result = ((base | 0) + (offset | 0)) | 0;
    return result | 0;
}
ARMInstructionSet.prototype.updateBasePreDecrement = function (operand, offset) {
    operand = operand | 0;
    offset = offset | 0;
    var baseRegisterNumber = (operand >> 16) & 0xF;
    var base = this.registers[baseRegisterNumber | 0] | 0;
    var result = ((base | 0) - (offset | 0)) | 0;
    this.guardRegisterWrite(baseRegisterNumber | 0, result | 0);
    return result | 0;
}
ARMInstructionSet.prototype.updateBasePreIncrement = function (operand, offset) {
    operand = operand | 0;
    offset = offset | 0;
    var baseRegisterNumber = (operand >> 16) & 0xF;
    var base = this.registers[baseRegisterNumber | 0] | 0;
    var result = ((base | 0) + (offset | 0)) | 0;
    this.guardRegisterWrite(baseRegisterNumber | 0, result | 0);
    return result | 0;
}
/*ARMInstructionSet.prototype.solveForRegCount = function () {
    //Solve for the number of items in the register lists of multi-load/store:
    for (var rListPosition = 0, count = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
        count = ((count | 0) + ((parentObj.execute & (1 << rListPosition)) >> rListPosition)) | 0;
    }
    return count | 0;
}*/
ARMInstructionSet.prototype.BX = function (parentObj, operand2OP) {
    //Branch & eXchange:
    var address = parentObj.read0OffsetRegister() | 0;
    if ((address & 0x1) == 0) {
        //Stay in ARM mode:
        parentObj.CPUCore.branch(address & -4);
    }
    else {
        //Enter THUMB mode:
        parentObj.CPUCore.enterTHUMB();
        parentObj.CPUCore.branch(address & -2);
    }
}
ARMInstructionSet.prototype.B = function (parentObj, operand2OP) {
    //Branch:
    parentObj.CPUCore.branch(((parentObj.readPC() | 0) + ((parentObj.execute << 8) >> 6)) | 0);
}
ARMInstructionSet.prototype.BL = function (parentObj, operand2OP) {
    //Branch with Link:
    parentObj.writeRegister(0xE, parentObj.getLR() | 0);
    parentObj.B(parentObj);
}
ARMInstructionSet.prototype.AND = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise AND:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(operand1 & operand2);
}
ARMInstructionSet.prototype.AND2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise AND:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(operand1 & operand2);
}
ARMInstructionSet.prototype.ANDS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise AND:
    var result = operand1 & operand2;
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard12OffsetRegisterWriteCPSR(result | 0);
}
ARMInstructionSet.prototype.ANDS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise AND:
    var result = operand1 & operand2;
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard12OffsetRegisterWriteCPSR(result | 0);
}
ARMInstructionSet.prototype.EOR = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise EOR:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(operand1 ^ operand2);
}
ARMInstructionSet.prototype.EOR2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise EOR:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(operand1 ^ operand2);
}
ARMInstructionSet.prototype.EORS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise EOR:
    var result = operand1 ^ operand2;
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard12OffsetRegisterWriteCPSR(result | 0);
}
ARMInstructionSet.prototype.EORS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise EOR:
    var result = operand1 ^ operand2;
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard12OffsetRegisterWriteCPSR(result | 0);
}
ARMInstructionSet.prototype.SUB = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform Subtraction:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(((operand1 | 0) - (operand2 | 0)) | 0);
}
ARMInstructionSet.prototype.SUB2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform Subtraction:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(((operand1 | 0) - (operand2 | 0)) | 0);
}
ARMInstructionSet.prototype.SUBS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Update destination register:
    parentObj.guard12OffsetRegisterWriteCPSR(parentObj.CPSR.setSUBFlags(operand1 | 0, operand2 | 0) | 0);
}
ARMInstructionSet.prototype.SUBS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Update destination register:
    parentObj.guard12OffsetRegisterWriteCPSR(parentObj.CPSR.setSUBFlags(operand1 | 0, operand2 | 0) | 0);
}
ARMInstructionSet.prototype.RSB = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform Subtraction:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(((operand2 | 0) - (operand1 | 0)) | 0);
}
ARMInstructionSet.prototype.RSB2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform Subtraction:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(((operand2 | 0) - (operand1 | 0)) | 0);
}
ARMInstructionSet.prototype.RSBS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Update destination register:
    parentObj.guard12OffsetRegisterWriteCPSR(parentObj.CPSR.setSUBFlags(operand2 | 0, operand1 | 0) | 0);
}
ARMInstructionSet.prototype.RSBS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Update destination register:
    parentObj.guard12OffsetRegisterWriteCPSR(parentObj.CPSR.setSUBFlags(operand2 | 0, operand1 | 0) | 0);
}
ARMInstructionSet.prototype.ADD = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform Addition:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(((operand1 | 0) + (operand2 | 0)) | 0);
}
ARMInstructionSet.prototype.ADD2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform Addition:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(((operand1 | 0) + (operand2 | 0)) | 0);
}
ARMInstructionSet.prototype.ADDS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute) | 0;
    //Update destination register:
    parentObj.guard12OffsetRegisterWriteCPSR(parentObj.CPSR.setADDFlags(operand1 | 0, operand2 | 0) | 0);
}
ARMInstructionSet.prototype.ADDS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute) | 0;
    //Update destination register:
    parentObj.guard12OffsetRegisterWriteCPSR(parentObj.CPSR.setADDFlags(operand1 | 0, operand2 | 0) | 0);
}
ARMInstructionSet.prototype.ADC = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform Addition w/ Carry:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(((operand1 | 0) + (operand2 | 0) + (parentObj.CPSR.getCarryInt() | 0)) | 0);
}
ARMInstructionSet.prototype.ADC2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform Addition w/ Carry:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(((operand1 | 0) + (operand2 | 0) + (parentObj.CPSR.getCarryInt() | 0)) | 0);
}
ARMInstructionSet.prototype.ADCS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Update destination register:
    parentObj.guard12OffsetRegisterWriteCPSR(parentObj.CPSR.setADCFlags(operand1 | 0, operand2 | 0) | 0);
}
ARMInstructionSet.prototype.ADCS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Update destination register:
    parentObj.guard12OffsetRegisterWriteCPSR(parentObj.CPSR.setADCFlags(operand1 | 0, operand2 | 0) | 0);
}
ARMInstructionSet.prototype.SBC = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform Subtraction w/ Carry:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(((operand1 | 0) - (operand2 | 0) - (parentObj.CPSR.getCarryIntReverse() | 0)) | 0);
}
ARMInstructionSet.prototype.SBC2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform Subtraction w/ Carry:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(((operand1 | 0) - (operand2 | 0) - (parentObj.CPSR.getCarryIntReverse() | 0)) | 0);
}
ARMInstructionSet.prototype.SBCS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Update destination register:
    parentObj.guard12OffsetRegisterWriteCPSR(parentObj.CPSR.setSBCFlags(operand1 | 0, operand2 | 0) | 0);
}
ARMInstructionSet.prototype.SBCS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Update destination register:
    parentObj.guard12OffsetRegisterWriteCPSR(parentObj.CPSR.setSBCFlags(operand1 | 0, operand2 | 0) | 0);
}
ARMInstructionSet.prototype.RSC = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform Reverse Subtraction w/ Carry:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(((operand2 | 0) - (operand1 | 0) - (parentObj.CPSR.getCarryIntReverse() | 0)) | 0);
}
ARMInstructionSet.prototype.RSC2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform Reverse Subtraction w/ Carry:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(((operand2 | 0) - (operand1 | 0) - (parentObj.CPSR.getCarryIntReverse() | 0)) | 0);
}
ARMInstructionSet.prototype.RSCS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Update destination register:
    parentObj.guard12OffsetRegisterWriteCPSR(parentObj.CPSR.setSBCFlags(operand2 | 0, operand1 | 0) | 0);
}
ARMInstructionSet.prototype.RSCS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Update destination register:
    parentObj.guard12OffsetRegisterWriteCPSR(parentObj.CPSR.setSBCFlags(operand2 | 0, operand1 | 0) | 0);
}
ARMInstructionSet.prototype.TSTS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise AND:
    var result = operand1 & operand2;
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
}
ARMInstructionSet.prototype.TSTS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise AND:
    var result = operand1 & operand2;
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
}
ARMInstructionSet.prototype.TEQS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise EOR:
    var result = operand1 ^ operand2;
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
}
ARMInstructionSet.prototype.TEQS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise EOR:
    var result = operand1 ^ operand2;
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
}
ARMInstructionSet.prototype.CMPS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    parentObj.CPSR.setCMPFlags(operand1 | 0, operand2 | 0);
}
ARMInstructionSet.prototype.CMPS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    parentObj.CPSR.setCMPFlags(operand1 | 0, operand2 | 0);
}
ARMInstructionSet.prototype.CMNS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0);
    parentObj.CPSR.setCMNFlags(operand1 | 0, operand2 | 0);
}
ARMInstructionSet.prototype.CMNS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0);
    parentObj.CPSR.setCMNFlags(operand1 | 0, operand2 | 0);
}
ARMInstructionSet.prototype.ORR = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise OR:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(operand1 | operand2);
}
ARMInstructionSet.prototype.ORR2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise OR:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(operand1 | operand2);
}
ARMInstructionSet.prototype.ORRS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise OR:
    var result = operand1 | operand2;
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard12OffsetRegisterWriteCPSR(result | 0);
}
ARMInstructionSet.prototype.ORRS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise OR:
    var result = operand1 | operand2;
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard12OffsetRegisterWriteCPSR(result | 0);
}
ARMInstructionSet.prototype.MOV = function (parentObj, operand2OP) {
    //Perform move:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(operand2OP(parentObj, parentObj.execute | 0) | 0);
}
ARMInstructionSet.prototype.MOVS = function (parentObj, operand2OP) {
    var operand2 = operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform move:
    parentObj.CPSR.setNegativeInt(operand2 | 0);
    parentObj.CPSR.setZeroInt(operand2 | 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard12OffsetRegisterWriteCPSR(operand2 | 0);
}
ARMInstructionSet.prototype.BIC = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    //NOT operand 2:
    var operand2 = ~operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise AND:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(operand1 & operand2);
}
ARMInstructionSet.prototype.BIC2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    //NOT operand 2:
    var operand2 = ~operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise AND:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(operand1 & operand2);
}
ARMInstructionSet.prototype.BICS = function (parentObj, operand2OP) {
    var operand1 = parentObj.read16OffsetRegister() | 0;
    //NOT operand 2:
    var operand2 = ~operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise AND:
    var result = operand1 & operand2;
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard12OffsetRegisterWriteCPSR(result | 0);
}
ARMInstructionSet.prototype.BICS2 = function (parentObj, operand2OP) {
    var operand1 = parentObj.readGuarded16OffsetRegister() | 0;
    //NOT operand 2:
    var operand2 = ~operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform bitwise AND:
    var result = operand1 & operand2;
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard12OffsetRegisterWriteCPSR(result | 0);
}
ARMInstructionSet.prototype.MVN = function (parentObj, operand2OP) {
    //Perform move negative:
    //Update destination register:
    parentObj.guard12OffsetRegisterWrite(~operand2OP(parentObj, parentObj.execute | 0));
}
ARMInstructionSet.prototype.MVNS = function (parentObj, operand2OP) {
    var operand2 = ~operand2OP(parentObj, parentObj.execute | 0) | 0;
    //Perform move negative:
    parentObj.CPSR.setNegativeInt(operand2 | 0);
    parentObj.CPSR.setZeroInt(operand2 | 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard12OffsetRegisterWriteCPSR(operand2 | 0);
}
ARMInstructionSet.prototype.MRS = function (parentObj, operand2OP) {
    //Transfer PSR to Register
    parentObj.guard12OffsetRegisterWrite(operand2OP(parentObj) | 0);
}
ARMInstructionSet.prototype.MSR = function (parentObj, operand2OP) {
    //Transfer Register/Immediate to PSR:
    operand2OP(parentObj, parentObj.execute | 0);
}
ARMInstructionSet.prototype.MUL = function (parentObj, operand2OP) {
    //Perform multiplication:
    var result = parentObj.CPUCore.performMUL32(parentObj.read0OffsetRegister() | 0, parentObj.read8OffsetRegister() | 0, 0) | 0;
    //Update destination register:
    parentObj.guard16OffsetRegisterWrite(result | 0);
}
ARMInstructionSet.prototype.MULS = function (parentObj, operand2OP) {
    //Perform multiplication:
    var result = parentObj.CPUCore.performMUL32(parentObj.read0OffsetRegister() | 0, parentObj.read8OffsetRegister() | 0, 0) | 0;
    parentObj.CPSR.setCarryFalse();
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard16OffsetRegisterWrite(result | 0);
}
ARMInstructionSet.prototype.MLA = function (parentObj, operand2OP) {
    //Perform multiplication:
    var result = parentObj.CPUCore.performMUL32(parentObj.read0OffsetRegister() | 0, parentObj.read8OffsetRegister() | 0, 1) | 0;
    //Perform addition:
    result = ((result | 0) + (parentObj.read12OffsetRegister() | 0));
    //Update destination register:
    parentObj.guard16OffsetRegisterWrite(result | 0);
}
ARMInstructionSet.prototype.MLAS = function (parentObj, operand2OP) {
    //Perform multiplication:
    var result = parentObj.CPUCore.performMUL32(parentObj.read0OffsetRegister() | 0, parentObj.read8OffsetRegister() | 0, 1) | 0;
    //Perform addition:
    result = ((result | 0) + (parentObj.read12OffsetRegister() | 0)) | 0;
    parentObj.CPSR.setCarryFalse();
    parentObj.CPSR.setNegativeInt(result | 0);
    parentObj.CPSR.setZeroInt(result | 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard16OffsetRegisterWrite(result | 0);
}
ARMInstructionSet.prototype.UMULL = function (parentObj, operand2OP) {
    //Perform multiplication:
    parentObj.CPUCore.performUMUL64(parentObj.read0OffsetRegister() | 0, parentObj.read8OffsetRegister() | 0);
    //Update destination register:
    parentObj.guard16OffsetRegisterWrite(parentObj.CPUCore.mul64ResultHigh | 0);
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.mul64ResultLow | 0);
}
ARMInstructionSet.prototype.UMULLS = function (parentObj, operand2OP) {
    //Perform multiplication:
    parentObj.CPUCore.performUMUL64(parentObj.read0OffsetRegister() | 0, parentObj.read8OffsetRegister() | 0);
    parentObj.CPSR.setCarryFalse();
    parentObj.CPSR.setNegativeInt(parentObj.CPUCore.mul64ResultHigh | 0);
    parentObj.CPSR.setZero((parentObj.CPUCore.mul64ResultHigh | 0) == 0 && (parentObj.CPUCore.mul64ResultLow | 0) == 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard16OffsetRegisterWrite(parentObj.CPUCore.mul64ResultHigh | 0);
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.mul64ResultLow | 0);
}
ARMInstructionSet.prototype.UMLAL = function (parentObj, operand2OP) {
    //Perform multiplication:
    parentObj.CPUCore.performUMLA64(parentObj.read0OffsetRegister() | 0, parentObj.read8OffsetRegister() | 0, parentObj.read16OffsetRegister() | 0, parentObj.read12OffsetRegister() | 0);
    //Update destination register:
    parentObj.guard16OffsetRegisterWrite(parentObj.CPUCore.mul64ResultHigh | 0);
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.mul64ResultLow | 0);
}
ARMInstructionSet.prototype.UMLALS = function (parentObj, operand2OP) {
    //Perform multiplication:
    parentObj.CPUCore.performUMLA64(parentObj.read0OffsetRegister() | 0, parentObj.read8OffsetRegister() | 0, parentObj.read16OffsetRegister() | 0, parentObj.read12OffsetRegister() | 0);
    parentObj.CPSR.setCarryFalse();
    parentObj.CPSR.setNegativeInt(parentObj.CPUCore.mul64ResultHigh | 0);
    parentObj.CPSR.setZero((parentObj.CPUCore.mul64ResultHigh | 0) == 0 && (parentObj.CPUCore.mul64ResultLow | 0) == 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard16OffsetRegisterWrite(parentObj.CPUCore.mul64ResultHigh | 0);
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.mul64ResultLow | 0);
}
ARMInstructionSet.prototype.SMULL = function (parentObj, operand2OP) {
    //Perform multiplication:
    parentObj.CPUCore.performMUL64(parentObj.read0OffsetRegister() | 0, parentObj.read8OffsetRegister() | 0);
    //Update destination register:
    parentObj.guard16OffsetRegisterWrite(parentObj.CPUCore.mul64ResultHigh | 0);
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.mul64ResultLow | 0);
}
ARMInstructionSet.prototype.SMULLS = function (parentObj, operand2OP) {
    //Perform multiplication:
    parentObj.CPUCore.performMUL64(parentObj.read0OffsetRegister() | 0, parentObj.read8OffsetRegister() | 0);
    parentObj.CPSR.setCarryFalse();
    parentObj.CPSR.setNegativeInt(parentObj.CPUCore.mul64ResultHigh | 0);
    parentObj.CPSR.setZero((parentObj.CPUCore.mul64ResultHigh | 0) == 0 && (parentObj.CPUCore.mul64ResultLow | 0) == 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard16OffsetRegisterWrite(parentObj.CPUCore.mul64ResultHigh | 0);
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.mul64ResultLow | 0);
}
ARMInstructionSet.prototype.SMLAL = function (parentObj, operand2OP) {
    //Perform multiplication:
    parentObj.CPUCore.performMLA64(parentObj.read0OffsetRegister() | 0, parentObj.read8OffsetRegister() | 0, parentObj.read16OffsetRegister() | 0, parentObj.read12OffsetRegister() | 0);
    //Update destination register:
    parentObj.guard16OffsetRegisterWrite(parentObj.CPUCore.mul64ResultHigh | 0);
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.mul64ResultLow | 0);
}
ARMInstructionSet.prototype.SMLALS = function (parentObj, operand2OP) {
    //Perform multiplication:
    parentObj.CPUCore.performMLA64(parentObj.read0OffsetRegister() | 0, parentObj.read8OffsetRegister() | 0, parentObj.read16OffsetRegister() | 0, parentObj.read12OffsetRegister() | 0);
    parentObj.CPSR.setCarryFalse();
    parentObj.CPSR.setNegativeInt(parentObj.CPUCore.mul64ResultHigh | 0);
    parentObj.CPSR.setZero((parentObj.CPUCore.mul64ResultHigh | 0) == 0 && (parentObj.CPUCore.mul64ResultLow | 0) == 0);
    //Update destination register and guard CPSR for PC:
    parentObj.guard16OffsetRegisterWrite(parentObj.CPUCore.mul64ResultHigh | 0);
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.mul64ResultLow | 0);
}
ARMInstructionSet.prototype.STRH = function (parentObj, operand2OP) {
    //Perform halfword store calculations:
    var address = operand2OP(parentObj, parentObj.execute | 0, false) | 0;
    //Write to memory location:
    parentObj.CPUCore.write16(address | 0, parentObj.guardRegisterRead((parentObj.execute >> 12) & 0xF) | 0);
}
ARMInstructionSet.prototype.LDRH = function (parentObj, operand2OP) {
    //Perform halfword load calculations:
    var address = operand2OP(parentObj, parentObj.execute | 0, false) | 0;
    //Read from memory location:
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.read16(address | 0) | 0);
}
ARMInstructionSet.prototype.LDRSH = function (parentObj, operand2OP) {
    //Perform signed halfword load calculations:
    var address = operand2OP(parentObj, parentObj.execute | 0, false) | 0;
    //Read from memory location:
    parentObj.guard12OffsetRegisterWrite((parentObj.CPUCore.read16(address | 0) << 16) >> 16);
}
ARMInstructionSet.prototype.LDRSB = function (parentObj, operand2OP) {
    //Perform signed byte load calculations:
    var address = operand2OP(parentObj, parentObj.execute | 0, false) | 0;
    //Read from memory location:
    parentObj.guard12OffsetRegisterWrite((parentObj.CPUCore.read8(address | 0) << 24) >> 24);
}
ARMInstructionSet.prototype.STR = function (parentObj, operand2OP) {
    //Perform word store calculations:
    var address = operand2OP(parentObj, parentObj.execute | 0, false) | 0;
    //Write to memory location:
    parentObj.CPUCore.write32(address | 0, parentObj.guardRegisterRead((parentObj.execute >> 12) & 0xF) | 0);
}
ARMInstructionSet.prototype.LDR = function (parentObj, operand2OP) {
    //Perform word load calculations:
    var address = operand2OP(parentObj, parentObj.execute | 0, false) | 0;
    //Read from memory location:
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.read32(address | 0) | 0);
}
ARMInstructionSet.prototype.STRB = function (parentObj, operand2OP) {
    //Perform byte store calculations:
    var address = operand2OP(parentObj, parentObj.execute | 0, false) | 0;
    //Write to memory location:
    parentObj.CPUCore.write8(address | 0, parentObj.guardRegisterRead((parentObj.execute >> 12) & 0xF) | 0);
}
ARMInstructionSet.prototype.LDRB = function (parentObj, operand2OP) {
    //Perform byte store calculations:
    var address = operand2OP(parentObj, parentObj.execute | 0, false) | 0;
    //Read from memory location:
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.read8(address | 0) | 0);
}
ARMInstructionSet.prototype.STRT = function (parentObj, operand2OP) {
    //Perform word store calculations (forced user-mode):
    var address = operand2OP(parentObj, parentObj.execute | 0, true) | 0;
    //Write to memory location:
    parentObj.CPUCore.write32(address | 0, parentObj.guardRegisterRead((parentObj.execute >> 12) & 0xF) | 0);
}
ARMInstructionSet.prototype.LDRT = function (parentObj, operand2OP) {
    //Perform word load calculations (forced user-mode):
    var address = operand2OP(parentObj, parentObj.execute | 0, true) | 0;
    //Read from memory location:
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.read32(address | 0) | 0);
}
ARMInstructionSet.prototype.STRBT = function (parentObj, operand2OP) {
    //Perform byte store calculations (forced user-mode):
    var address = operand2OP(parentObj, parentObj.execute | 0, true) | 0;
    //Write to memory location:
    parentObj.CPUCore.write8(address | 0, parentObj.guardRegisterRead((parentObj.execute >> 12) & 0xF) | 0);
}
ARMInstructionSet.prototype.LDRBT = function (parentObj, operand2OP) {
    //Perform byte load calculations (forced user-mode):
    var address = operand2OP(parentObj, parentObj.execute | 0, true) | 0;
    //Read from memory location:
    parentObj.guard12OffsetRegisterWrite(parentObj.CPUCore.read8(address | 0) | 0);
}
ARMInstructionSet.prototype.STMIA = function (parentObj, operand2OP) {
    //Only initialize the STMIA sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Push register(s) into memory:
        for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Push a register into memory:
                parentObj.stackMemoryCache.memoryWrite32(currentAddress >>> 0, operand2OP(parentObj, rListPosition | 0) | 0);
                currentAddress = ((currentAddress | 0) + 4) | 0;
            }
        }
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.STMIAW = function (parentObj, operand2OP) {
    //Only initialize the STMIA sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Push register(s) into memory:
        for (var rListPosition = 0; rListPosition < 0x10; rListPosition = ((rListPosition | 0) + 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Push a register into memory:
                parentObj.stackMemoryCache.memoryWrite32(currentAddress >>> 0, operand2OP(parentObj, rListPosition | 0) | 0);
                currentAddress = ((currentAddress | 0) + 4) | 0;
            }
        }
        //Store the updated base address back into register:
        parentObj.guard16OffsetRegisterWrite(currentAddress | 0);
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.STMDA = function (parentObj, operand2OP) {
    //Only initialize the STMDA sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Push register(s) into memory:
        for (var rListPosition = 0xF; rListPosition > -1; rListPosition = ((rListPosition | 0) - 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Push a register into memory:
                parentObj.stackMemoryCache.memoryWrite32(currentAddress >>> 0, operand2OP(parentObj, rListPosition | 0) | 0);
                currentAddress = ((currentAddress | 0) - 4) | 0;
            }
        }
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.STMDAW = function (parentObj, operand2OP) {
    //Only initialize the STMDA sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Push register(s) into memory:
        for (var rListPosition = 0xF; rListPosition > -1; rListPosition = ((rListPosition | 0) - 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Push a register into memory:
                parentObj.stackMemoryCache.memoryWrite32(currentAddress >>> 0, operand2OP(parentObj, rListPosition | 0) | 0);
                currentAddress = ((currentAddress | 0) - 4) | 0;
            }
        }
        //Store the updated base address back into register:
        parentObj.guard16OffsetRegisterWrite(currentAddress | 0);
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.STMIB = function (parentObj, operand2OP) {
    //Only initialize the STMIB sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Push register(s) into memory:
        for (var rListPosition = 0; rListPosition < 0x10;  rListPosition = ((rListPosition | 0) + 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Push a register into memory:
                currentAddress = ((currentAddress | 0) + 4) | 0;
                parentObj.stackMemoryCache.memoryWrite32(currentAddress >>> 0, operand2OP(parentObj, rListPosition | 0) | 0);
            }
        }
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.STMIBW = function (parentObj, operand2OP) {
    //Only initialize the STMIB sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Push register(s) into memory:
        for (var rListPosition = 0; rListPosition < 0x10;  rListPosition = ((rListPosition | 0) + 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Push a register into memory:
                currentAddress = ((currentAddress | 0) + 4) | 0;
                parentObj.stackMemoryCache.memoryWrite32(currentAddress >>> 0, operand2OP(parentObj, rListPosition | 0) | 0);
            }
        }
        //Store the updated base address back into register:
        parentObj.guard16OffsetRegisterWrite(currentAddress | 0);
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.STMDB = function (parentObj, operand2OP) {
    //Only initialize the STMDB sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Push register(s) into memory:
        for (var rListPosition = 0xF; rListPosition > -1; rListPosition = ((rListPosition | 0) - 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Push a register into memory:
                currentAddress = ((currentAddress | 0) - 4) | 0;
                parentObj.stackMemoryCache.memoryWrite32(currentAddress >>> 0, operand2OP(parentObj, rListPosition | 0) | 0);
            }
        }
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.STMDBW = function (parentObj, operand2OP) {
    //Only initialize the STMDB sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Push register(s) into memory:
        for (var rListPosition = 0xF; rListPosition > -1; rListPosition = ((rListPosition | 0) - 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Push a register into memory:
                currentAddress = ((currentAddress | 0) - 4) | 0;
                parentObj.stackMemoryCache.memoryWrite32(currentAddress >>> 0, operand2OP(parentObj, rListPosition >>> 0) | 0);
            }
        }
        //Store the updated base address back into register:
        parentObj.guard16OffsetRegisterWrite(currentAddress | 0);
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.LDMIA = function (parentObj, operand2OP) {
    //Only initialize the LDMIA sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Load register(s) from memory:
        for (var rListPosition = 0; rListPosition < 0x10;  rListPosition = ((rListPosition | 0) + 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Load a register from memory:
                operand2OP(parentObj, rListPosition | 0, parentObj.stackMemoryCache.memoryRead32(currentAddress >>> 0) | 0);
                currentAddress = ((currentAddress | 0) + 4) | 0;
            }
        }
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.LDMIAW = function (parentObj, operand2OP) {
    //Only initialize the LDMIA sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Load register(s) from memory:
        for (var rListPosition = 0; rListPosition < 0x10;  rListPosition = ((rListPosition | 0) + 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Load a register from memory:
                operand2OP(parentObj, rListPosition | 0, parentObj.stackMemoryCache.memoryRead32(currentAddress >>> 0) | 0);
                currentAddress = ((currentAddress | 0) + 4) | 0;
            }
        }
        //Store the updated base address back into register:
        parentObj.guard16OffsetRegisterWrite(currentAddress | 0);
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.LDMDA = function (parentObj, operand2OP) {
    //Only initialize the LDMDA sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Load register(s) from memory:
        for (var rListPosition = 0xF; rListPosition > -1; rListPosition = ((rListPosition | 0) - 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Load a register from memory:
                operand2OP(parentObj, rListPosition | 0, parentObj.stackMemoryCache.memoryRead32(currentAddress >>> 0) | 0);
                currentAddress = ((currentAddress | 0) - 4) | 0;
            }
        }
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.LDMDAW = function (parentObj, operand2OP) {
    //Only initialize the LDMDA sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Load register(s) from memory:
        for (var rListPosition = 0xF; rListPosition > -1; rListPosition = ((rListPosition | 0) - 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Load a register from memory:
                operand2OP(parentObj, rListPosition | 0, parentObj.stackMemoryCache.memoryRead32(currentAddress >>> 0) | 0);
                currentAddress = ((currentAddress | 0) - 4) | 0;
            }
        }
        //Store the updated base address back into register:
        parentObj.guard16OffsetRegisterWrite(currentAddress | 0);
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.LDMIB = function (parentObj, operand2OP) {
    //Only initialize the LDMIB sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Load register(s) from memory:
        for (var rListPosition = 0; rListPosition < 0x10;  rListPosition = ((rListPosition | 0) + 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Load a register from memory:
                currentAddress = ((currentAddress | 0) + 4) | 0;
                operand2OP(parentObj, rListPosition | 0, parentObj.stackMemoryCache.memoryRead32(currentAddress >>> 0) | 0);
            }
        }
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.LDMIBW = function (parentObj, operand2OP) {
    //Only initialize the LDMIB sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Load register(s) from memory:
        for (var rListPosition = 0; rListPosition < 0x10;  rListPosition = ((rListPosition | 0) + 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Load a register from memory:
                currentAddress = ((currentAddress | 0) + 4) | 0;
                operand2OP(parentObj, rListPosition | 0, parentObj.stackMemoryCache.memoryRead32(currentAddress >>> 0) | 0);
            }
        }
        //Store the updated base address back into register:
        parentObj.guard16OffsetRegisterWrite(currentAddress | 0);
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.LDMDB = function (parentObj, operand2OP) {
    //Only initialize the LDMDB sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Load register(s) from memory:
        for (var rListPosition = 0xF; rListPosition > -1; rListPosition = ((rListPosition | 0) - 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Load a register from memory:
                currentAddress = ((currentAddress | 0) - 4) | 0;
                operand2OP(parentObj, rListPosition | 0, parentObj.stackMemoryCache.memoryRead32(currentAddress >>> 0) | 0);
            }
        }
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.LDMDBW = function (parentObj, operand2OP) {
    //Only initialize the LDMDB sequence if the register list is non-empty:
    if ((parentObj.execute & 0xFFFF) > 0) {
        //Get the base address:
        var currentAddress = parentObj.read16OffsetRegister() | 0;
        //Updating the address bus away from PC fetch:
        parentObj.wait.NonSequentialBroadcast();
        //Load register(s) from memory:
        for (var rListPosition = 0xF; rListPosition > -1; rListPosition = ((rListPosition | 0) - 1) | 0) {
            if ((parentObj.execute & (1 << rListPosition)) != 0) {
                //Load a register from memory:
                currentAddress = ((currentAddress | 0) - 4) | 0;
                operand2OP(parentObj, rListPosition | 0, parentObj.stackMemoryCache.memoryRead32(currentAddress >>> 0) | 0);
            }
        }
        //Store the updated base address back into register:
        parentObj.guard16OffsetRegisterWrite(currentAddress | 0);
        //Updating the address bus back to PC fetch:
        parentObj.wait.NonSequentialBroadcast();
    }
}
ARMInstructionSet.prototype.SWP = function (parentObj, operand2OP) {
    var base = parentObj.read16OffsetRegister() | 0;
    var data = parentObj.CPUCore.read32(base | 0) | 0;
    //Clock a cycle for the processing delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    parentObj.CPUCore.write32(base | 0, parentObj.readRegister(parentObj.execute & 0xF) | 0);
    parentObj.guard12OffsetRegisterWrite(data | 0);
}
ARMInstructionSet.prototype.SWPB = function (parentObj, operand2OP) {
    var base = parentObj.read16OffsetRegister() | 0;
    var data = parentObj.CPUCore.read8(base | 0) | 0;
    //Clock a cycle for the processing delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    parentObj.CPUCore.write8(base | 0, parentObj.readRegister(parentObj.execute & 0xF) | 0);
    parentObj.guard12OffsetRegisterWrite(data | 0);
}
ARMInstructionSet.prototype.SWI = function (parentObj, operand2OP) {
    //Software Interrupt:
    parentObj.CPUCore.SWI();
}
ARMInstructionSet.prototype.CDP = function (parentObj, operand2OP) {
    //No co-processor on GBA, but we really should do the bail properly:
    parentObj.CPUCore.UNDEFINED();
}
ARMInstructionSet.prototype.LDC = function (parentObj, operand2OP) {
    //No co-processor on GBA, but we really should do the bail properly:
    parentObj.CPUCore.UNDEFINED();
}
ARMInstructionSet.prototype.STC = function (parentObj, operand2OP) {
    //No co-processor on GBA, but we really should do the bail properly:
    parentObj.CPUCore.UNDEFINED();
}
ARMInstructionSet.prototype.MRC = function (parentObj, operand2OP) {
    //No co-processor on GBA, but we really should do the bail properly:
    parentObj.CPUCore.UNDEFINED();
}
ARMInstructionSet.prototype.MCR = function (parentObj, operand2OP) {
    //No co-processor on GBA, but we really should do the bail properly:
    parentObj.CPUCore.UNDEFINED();
}
ARMInstructionSet.prototype.UNDEFINED = function (parentObj, operand2OP) {
    //Undefined Exception:
    parentObj.CPUCore.UNDEFINED();
}
ARMInstructionSet.prototype.lli = function (parentObj, operand) {
    operand = operand | 0;
    return parentObj.lli2(operand | 0) | 0;
}
ARMInstructionSet.prototype.lli2 = function (operand) {
    operand = operand | 0;
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = this.readRegister(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    this.wait.CPUInternalSingleCyclePrefetch();
    //Shift the register data left:
    var shifter = (operand >> 7) & 0x1F;
    return register << shifter;
}
ARMInstructionSet.prototype.llis = function (parentObj, operand) {
    operand = operand | 0;
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = parentObj.readRegister(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    //Get the shift amount:
    var shifter = (operand >> 7) & 0x1F;
    //Check to see if we need to update CPSR:
    if (shifter > 0) {
        parentObj.CPSR.setCarry((register << (shifter - 1)) < 0); 
    }
    //Shift the register data left:
    return register << shifter;
}
ARMInstructionSet.prototype.llr = function (parentObj, operand) {
    operand = operand | 0;
    //Logical Left Shift with Register:
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = parentObj.guardRegisterRead(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    //Shift the register data left:
    var shifter = parentObj.guardRegisterRead((operand >> 8) & 0xF) & 0xFF;
    return (shifter < 0x20) ? (register << shifter) : 0;
}
ARMInstructionSet.prototype.llrs = function (parentObj, operand) {
    operand = operand | 0;
    //Logical Left Shift with Register and CPSR:
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = parentObj.guardRegisterRead(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    //Get the shift amount:
    var shifter = parentObj.guardRegisterRead((operand >> 8) & 0xF) & 0xFF;
    //Check to see if we need to update CPSR:
    if (shifter > 0) {
        if (shifter < 0x20) {
            //Shift the register data left:
            parentObj.CPSR.setCarry((register << ((shifter - 1) | 0)) < 0);
            return register << shifter;
        }
        else if (shifter == 0x20) {
            //Shift bit 0 into carry:
            parentObj.CPSR.setCarry((register & 0x1) == 0x1);
        }
        else {
            //Everything Zero'd:
            parentObj.CPSR.setCarryFalse();
        }
        return 0;
    }
    //If shift is 0, just return the register without mod:
    return register | 0;
}
ARMInstructionSet.prototype.lri = function (parentObj, operand) {
    operand = operand | 0;
    return parentObj.lri2(operand | 0) | 0;
}
ARMInstructionSet.prototype.lri2 = function (operand) {
    operand = operand | 0;
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = this.readRegister(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    this.wait.CPUInternalSingleCyclePrefetch();
    //Shift the register data right logically:
    var shifter = (operand >> 7) & 0x1F;
    if (shifter == 0) {
        //Return 0:
        return 0;
    }
    return (register >>> shifter) | 0;
}
ARMInstructionSet.prototype.lris = function (parentObj, operand) {
    operand = operand | 0;
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = parentObj.readRegister(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    //Get the shift amount:
    var shifter = (operand >> 7) & 0x1F;
    //Check to see if we need to update CPSR:
    if (shifter > 0) {
        parentObj.CPSR.setCarry(((register >>> (shifter - 1)) & 0x1) == 0x1); 
        //Shift the register data right logically:
        return register >>> shifter;
    }
    else {
        parentObj.CPSR.setCarry(register < 0);
        //Return 0:
        return 0;
    }
}
ARMInstructionSet.prototype.lrr = function (parentObj, operand) {
    operand = operand | 0;
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = parentObj.guardRegisterRead(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    //Shift the register data right logically:
    var shifter = parentObj.guardRegisterRead((operand >> 8) & 0xF) & 0xFF;
    return (shifter < 0x20) ? ((register >>> shifter) | 0) : 0;
}
ARMInstructionSet.prototype.lrrs = function (parentObj, operand) {
    operand = operand | 0;
    //Logical Right Shift with Register and CPSR:
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = parentObj.guardRegisterRead(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    //Get the shift amount:
    var shifter = parentObj.guardRegisterRead((operand >> 8) & 0xF) & 0xFF;
    //Check to see if we need to update CPSR:
    if (shifter > 0) {
        if (shifter < 0x20) {
            //Shift the register data right logically:
            parentObj.CPSR.setCarry(((register >> ((shifter - 1) | 0)) & 0x1) == 0x1);
            return (register >>> shifter) | 0;
        }
        else if (shifter == 0x20) {
            //Shift bit 31 into carry:
            parentObj.CPSR.setCarry(register < 0);
        }
        else {
            //Everything Zero'd:
            parentObj.CPSR.setCarryFalse();
        }
        return 0;
    }
    //If shift is 0, just return the register without mod:
    return register | 0;
}
ARMInstructionSet.prototype.ari = function (parentObj, operand) {
    operand = operand | 0;
    return parentObj.ari2(operand | 0) | 0;
}
ARMInstructionSet.prototype.ari2 = function (operand) {
    operand = operand | 0;
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = this.readRegister(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    this.wait.CPUInternalSingleCyclePrefetch();
    //Get the shift amount:
    var shifter = (operand >> 7) & 0x1F;
    if (shifter == 0) {
        //Shift full length if shifter is zero:
        shifter = 0x1F;
    }
    //Shift the register data right:
    return register >> shifter;
}
ARMInstructionSet.prototype.aris = function (parentObj, operand) {
    operand = operand | 0;
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = parentObj.readRegister(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    //Get the shift amount:
    var shifter = (operand >> 7) & 0x1F;
    //Check to see if we need to update CPSR:
    if (shifter > 0) {
        parentObj.CPSR.setCarry(((register >>> (shifter - 1)) & 0x1) == 0x1);
    }
    else {
        //Shift full length if shifter is zero:
        shifter = 0x1F;
        parentObj.CPSR.setCarry(register < 0);
    }
    //Shift the register data right:
    return register >> shifter;
}
ARMInstructionSet.prototype.arr = function (parentObj, operand) {
    operand = operand | 0;
    //Arithmetic Right Shift with Register:
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = parentObj.guardRegisterRead(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    //Shift the register data right:
    return register >> Math.min(parentObj.guardRegisterRead((operand >> 8) & 0xF) & 0xFF, 0x1F);
}
ARMInstructionSet.prototype.arrs = function (parentObj, operand) {
    operand = operand | 0;
    //Arithmetic Right Shift with Register and CPSR:
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = parentObj.guardRegisterRead(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    //Get the shift amount:
    var shifter = parentObj.guardRegisterRead((operand >> 8) & 0xF) & 0xFF;
    //Check to see if we need to update CPSR:
    if (shifter > 0) {
        if (shifter < 0x20) {
            //Shift the register data right arithmetically:
            parentObj.CPSR.setCarry(((register >> ((shifter - 1) | 0)) & 0x1) == 0x1);
            return register >> shifter;
        }
        else {
            //Set all bits with bit 31:
            parentObj.CPSR.setCarry(register < 0);
            return register >> 0x1F;
        }
    }
    //If shift is 0, just return the register without mod:
    return register | 0;
}
ARMInstructionSet.prototype.rri = function (parentObj, operand) {
    return parentObj.rri2(operand) | 0;
}
ARMInstructionSet.prototype.rri2 = function (operand) {
    operand = operand | 0;
    //Rotate Right with Immediate:
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = this.readRegister(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    this.wait.CPUInternalSingleCyclePrefetch();
    //Rotate the register right:
    var shifter = (operand >> 7) & 0x1F;
    if (shifter > 0) {
        //ROR
        return (register << (0x20 - shifter)) | (register >>> shifter);
    }
    else {
        //RRX
        return ((this.CPSR.getCarry()) ? 0x80000000 : 0) | (register >>> 0x1);
    }
}
ARMInstructionSet.prototype.rris = function (parentObj, operand) {
    operand = operand | 0;
    //Rotate Right with Immediate and CPSR:
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = parentObj.readRegister(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    //Rotate the register right:
    var shifter = (operand >> 7) & 0x1F;
    if (shifter > 0) {
        //ROR
        parentObj.CPSR.setCarry(((register >>> (shifter - 1)) & 0x1) == 0x1);
        return (register << (0x20 - shifter)) | (register >>> shifter);
    }
    else {
        //RRX
        var rrxValue = ((parentObj.CPSR.getCarry()) ? 0x80000000 : 0) | (register >>> 0x1);
        parentObj.CPSR.setCarry((register & 0x1) != 0);
        return rrxValue | 0;
    }
}
ARMInstructionSet.prototype.rrr = function (parentObj, operand) {
    operand = operand | 0;
    //Rotate Right with Register:
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = parentObj.guardRegisterRead(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    //Rotate the register right:
    var shifter = parentObj.guardRegisterRead((operand >> 8) & 0xF) & 0x1F;
    if (shifter > 0) {
        //ROR
        return (register << (0x20 - shifter)) | (register >>> shifter);
    }
    //If shift is 0, just return the register without mod:
    return register | 0;
}
ARMInstructionSet.prototype.rrrs = function (parentObj, operand) {
    operand = operand | 0;
    //Rotate Right with Register and CPSR:
    var registerSelected = operand & 0xF;
    //Get the register data to be shifted:
    var register = parentObj.guardRegisterRead(registerSelected | 0) | 0;
    //Clock a cycle for the shift delaying the CPU:
    parentObj.wait.CPUInternalSingleCyclePrefetch();
    //Rotate the register right:
    var shifter = parentObj.guardRegisterRead((operand >> 8) & 0xF) & 0xFF;
    if (shifter > 0) {
        shifter &= 0x1F;
        if (shifter > 0) {
            //ROR
            parentObj.CPSR.setCarry(((register >>> (shifter - 1)) & 0x1) == 0x1);
            return (register << (0x20 - shifter)) | (register >>> shifter);
        }
        else {
            //No shift, but make carry set to bit 31:
            parentObj.CPSR.setCarry(register < 0);
        }
    }
    //If shift is 0, just return the register without mod:
    return register | 0;
}
ARMInstructionSet.prototype.imm = function (parentObj, operand) {
    //Get the immediate data to be shifted:
    var immediate = operand & 0xFF;
    //Rotate the immediate right:
    var shifter = (operand >> 7) & 0x1E;
    if (shifter > 0) {
        immediate = (immediate << (0x20 - shifter)) | (immediate >>> shifter);
    }
    return immediate | 0;
}
ARMInstructionSet.prototype.imms = function (parentObj, operand) {
    //Get the immediate data to be shifted:
    var immediate = operand & 0xFF;
    //Rotate the immediate right:
    var shifter = (operand >> 7) & 0x1E;
    if (shifter > 0) {
        immediate = (immediate << (0x20 - shifter)) | (immediate >>> shifter);
        parentObj.CPSRCarry = (immediate < 0);
    }
    return immediate | 0;
}
ARMInstructionSet.prototype.rc = function (parentObj) {
    return (
        ((parentObj.CPSR.getNegative()) ? 0x80000000 : 0) |
        ((parentObj.CPSR.getZero()) ? 0x40000000 : 0) |
        ((parentObj.CPSR.getCarry()) ? 0x20000000 : 0) |
        ((parentObj.CPSR.getOverflow()) ? 0x10000000 : 0) |
        ((parentObj.CPUCore.IRQDisabled) ? 0x80 : 0) |
        ((parentObj.CPUCore.FIQDisabled) ? 0x40 : 0) |
        parentObj.CPUCore.MODEBits
    );
}
ARMInstructionSet.prototype.rcs = function (parentObj, operand) {
    operand = operand | 0;
    var newcpsr = parentObj.readRegister(operand & 0xF) | 0;
    parentObj.CPSR.setNegativeInt(newcpsr | 0);
    parentObj.CPSR.setZero((newcpsr & 0x40000000) != 0);
    parentObj.CPSR.setCarry((newcpsr & 0x20000000) != 0);
    parentObj.CPSR.setOverflow((newcpsr & 0x10000000) != 0);
    if ((operand & 0x10000) == 0x10000 && (parentObj.CPUCore.MODEBits | 0) != 0x10) {
        parentObj.CPUCore.IRQDisabled = ((newcpsr & 0x80) != 0);
        parentObj.CPUCore.assertIRQ();
        parentObj.CPUCore.FIQDisabled = ((newcpsr & 0x40) != 0);
        //parentObj.CPUCore.THUMBBitModify((newcpsr & 0x20) != 0);
        //ARMWrestler test rom triggers THUMB mode, but expects it to remain in ARM mode, so ignore.
        parentObj.CPUCore.switchRegisterBank(newcpsr & 0x1F);
    }
}
ARMInstructionSet.prototype.rs = function (parentObj) {
    switch (parentObj.CPUCore.MODEBits | 0) {
        case 0x11:    //FIQ
            var spsr = parentObj.CPUCore.SPSRFIQ;
            break;
        case 0x12:    //IRQ
            var spsr = parentObj.CPUCore.SPSRIRQ;
            break;
        case 0x13:    //Supervisor
            var spsr = parentObj.CPUCore.SPSRSVC;
            break;
        case 0x17:    //Abort
            var spsr = parentObj.CPUCore.SPSRABT;
            break;
        case 0x1B:    //Undefined
            var spsr = parentObj.CPUCore.SPSRUND;
            break;
        default:
            //Instruction hit an invalid SPSR request:
            return parentObj.rc(parentObj) | 0;
    }
    return (
        ((spsr[0]) ? 0x80000000 : 0) |
        ((spsr[1]) ? 0x40000000 : 0) |
        ((spsr[2]) ? 0x20000000 : 0) |
        ((spsr[3]) ? 0x10000000 : 0) |
        ((spsr[4]) ? 0x80 : 0) |
        ((spsr[5]) ? 0x40 : 0) |
        ((spsr[6]) ? 0x20 : 0) |
        spsr[7]
    );
}
ARMInstructionSet.prototype.rss = function (parentObj, operand) {
    operand = operand | 0;
    var newspsr = parentObj.readRegister(operand & 0xF) | 0;
    switch (parentObj.CPUCore.MODEBits | 0) {
        case 0x11:    //FIQ
            var spsr = parentObj.CPUCore.SPSRFIQ;
            break;
        case 0x12:    //IRQ
            var spsr = parentObj.CPUCore.SPSRIRQ;
            break;
        case 0x13:    //Supervisor
            var spsr = parentObj.CPUCore.SPSRSVC;
            break;
        case 0x17:    //Abort
            var spsr = parentObj.CPUCore.SPSRABT;
            break;
        case 0x1B:    //Undefined
            var spsr = parentObj.CPUCore.SPSRUND;
            break;
        default:
            return;
    }
    spsr[0] = (newspsr < 0);
    spsr[1] = ((newspsr & 0x40000000) != 0);
    spsr[2] = ((newspsr & 0x20000000) != 0);
    spsr[3] = ((newspsr & 0x10000000) != 0);
    if ((operand & 0x10000) == 0x10000) {
        spsr[4] = ((newspsr & 0x80) != 0);
        spsr[5] = ((newspsr & 0x40) != 0);
        spsr[6] = ((newspsr & 0x20) != 0);
        spsr[7] = newspsr & 0x1F;
    }
}
ARMInstructionSet.prototype.ic = function (parentObj, operand) {
    operand = operand | 0;
    operand = parentObj.imm(parentObj, operand | 0) | 0;
    parentObj.CPSR.setNegativeInt(operand | 0);
    parentObj.CPSR.setZero((operand & 0x40000000) != 0);
    parentObj.CPSR.setCarry((operand & 0x20000000) != 0);
    parentObj.CPSR.setOverflow((operand & 0x10000000) != 0);
}
ARMInstructionSet.prototype.is = function (parentObj, operand) {
    operand = operand | 0;
    operand = parentObj.imm(parentObj, operand | 0) | 0;
    switch (parentObj.CPUCore.MODEBits | 0) {
        case 0x11:    //FIQ
            var spsr = parentObj.CPUCore.SPSRFIQ;
            break;
        case 0x12:    //IRQ
            var spsr = parentObj.CPUCore.SPSRIRQ;
            break;
        case 0x13:    //Supervisor
            var spsr = parentObj.CPUCore.SPSRSVC;
            break;
        case 0x17:    //Abort
            var spsr = parentObj.CPUCore.SPSRABT;
            break;
        case 0x1B:    //Undefined
            var spsr = parentObj.CPUCore.SPSRUND;
            break;
        default:
            return;
    }
    spsr[0] = (operand < 0);
    spsr[1] = ((operand & 0x40000000) != 0);
    spsr[2] = ((operand & 0x20000000) != 0);
    spsr[3] = ((operand & 0x10000000) != 0);
}
ARMInstructionSet.prototype.ptrm = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.readRegister(operand & 0xF) | 0;
    return parentObj.updateBasePostDecrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.ptim = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = ((operand & 0xF00) >> 4) | (operand & 0xF);
    return parentObj.updateBasePostDecrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.ptrp = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.readRegister(operand & 0xF) | 0;
    return parentObj.updateBasePostIncrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.ptip = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = ((operand & 0xF00) >> 4) | (operand & 0xF);
    return parentObj.updateBasePostIncrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.ofrm = function (parentObj, operand) {
    operand = operand | 0;
    var offset = parentObj.readRegister(operand & 0xF) | 0;
    return parentObj.updateNoBaseDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.prrm = function (parentObj, operand) {
    operand = operand | 0;
    var offset = parentObj.readRegister(operand & 0xF) | 0;
    return parentObj.updateBasePreDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.ofim = function (parentObj, operand) {
    operand = operand | 0;
    var offset = ((operand & 0xF00) >> 4) | (operand & 0xF);
    return parentObj.updateNoBaseDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.prim = function (parentObj, operand) {
    operand = operand | 0;
    var offset = ((operand & 0xF00) >> 4) | (operand & 0xF);
    return parentObj.updateBasePreDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.ofrp = function (parentObj, operand) {
    operand = operand | 0;
    var offset = parentObj.readRegister(operand & 0xF) | 0;
    return parentObj.updateNoBaseIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.prrp = function (parentObj, operand) {
    operand = operand | 0;
    var offset = parentObj.readRegister(operand & 0xF) | 0;
    return parentObj.updateBasePreIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.ofip = function (parentObj, operand) {
    operand = operand | 0;
    var offset = ((operand & 0xF00) >> 4) | (operand & 0xF);
    return parentObj.updateNoBaseIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.prip = function (parentObj, operand) {
    operand = operand | 0;
    var offset = ((operand & 0xF00) >> 4) | (operand & 0xF);
    return parentObj.updateBasePreIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.sptim = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = operand & 0xFFF;
    return parentObj.updateBasePostDecrement(operand | 0, offset | 0, userMode | 0);
}
ARMInstructionSet.prototype.sptip = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = operand & 0xFFF;
    return parentObj.updateBasePostIncrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.sofim = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = operand & 0xFFF;
    return parentObj.updateNoBaseDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.sprim = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = operand & 0xFFF;
    return parentObj.updateBasePreDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.sofip = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = operand & 0xFFF;
    return parentObj.updateNoBaseIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.sprip = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = operand & 0xFFF;
    return parentObj.updateBasePreIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.ptrmll = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.lli2(operand | 0) | 0;
    return parentObj.updateBasePostDecrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.ptrmlr = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.lri2(operand | 0) | 0;
    return parentObj.updateBasePostDecrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.ptrmar = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.ari2(operand | 0) | 0;
    return parentObj.updateBasePostDecrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.ptrmrr = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.rri2(operand | 0) | 0;
    return parentObj.updateBasePostDecrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.ptrpll = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.lli2(operand | 0) | 0;
    return parentObj.updateBasePostIncrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.ptrplr = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.lri2(operand | 0) | 0;
    return parentObj.updateBasePostIncrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.ptrpar = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.ari2(operand | 0) | 0;
    return parentObj.updateBasePostIncrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.ptrprr = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.rri2(operand | 0) | 0;
    return parentObj.updateBasePostIncrement(operand | 0, offset | 0, userMode) | 0;
}
ARMInstructionSet.prototype.ofrmll = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.lli2(operand | 0) | 0;
    return parentObj.updateNoBaseDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.ofrmlr = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.lri2(operand | 0) | 0;
    return parentObj.updateNoBaseDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.ofrmar = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.ari2(operand | 0) | 0;
    return parentObj.updateNoBaseDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.ofrmrr = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.rri2(operand | 0) | 0;
    return parentObj.updateNoBaseDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.prrmll = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.lli2(operand | 0) | 0;
    return parentObj.updateBasePreDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.prrmlr = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.lri2(operand | 0) | 0;
    return parentObj.updateBasePreDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.prrmar = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.ari2(operand | 0) | 0;
    return parentObj.updateBasePreDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.prrmrr = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.rri2(operand | 0) | 0;
    return parentObj.updateBasePreDecrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.ofrpll = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.lli2(operand | 0) | 0;
    return parentObj.updateNoBaseIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.ofrplr = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.lri2(operand | 0) | 0;
    return parentObj.updateNoBaseIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.ofrpar = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.ari2(operand | 0) | 0;
    return parentObj.updateNoBaseIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.ofrprr = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.rri2(operand | 0) | 0;
    return parentObj.updateNoBaseIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.prrpll = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.lli2(operand | 0) | 0;
    return parentObj.updateBasePreIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.prrplr = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.lri2(operand | 0) | 0;
    return parentObj.updateBasePreIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.prrpar = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.ari2(operand | 0) | 0;
    return parentObj.updateBasePreIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.prrprr = function (parentObj, operand, userMode) {
    operand = operand | 0;
    var offset = parentObj.rri2(operand | 0) | 0;
    return parentObj.updateBasePreIncrement(operand | 0, offset | 0) | 0;
}
ARMInstructionSet.prototype.ofm = ARMInstructionSet.prototype.prm =
ARMInstructionSet.prototype.ofp = ARMInstructionSet.prototype.prp =
ARMInstructionSet.prototype.unm = ARMInstructionSet.prototype.unp =
ARMInstructionSet.prototype.ptm = ARMInstructionSet.prototype.ptp =
ARMInstructionSet.prototype.NOP = function (parentObj, operand) {
    //nothing...
}
ARMInstructionSet.prototype.compileInstructionMap = function () {
    var instructionMap = [
        //0
        [
            [
                this.AND,
                this.lli
            ],
            [
                this.AND2,
                this.llr
            ],
            [
                this.AND,
                this.lri
            ],
            [
                this.AND2,
                this.lrr
            ],
            [
                this.AND,
                this.ari
            ],
            [
                this.AND2,
                this.arr
            ],
            [
                this.AND,
                this.rri
            ],
            [
                this.AND2,
                this.rrr
            ],
            [
                this.AND,
                this.lli
            ],
            [
                this.MUL,
                this.NOP
            ],
            [
                this.AND,
                this.lri
            ],
            [
                this.STRH,
                this.ptrm
            ],
            [
                this.AND,
                this.ari
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.AND,
                this.rri
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //1
        [
            [
                this.ANDS,
                this.llis
            ],
            [
                this.ANDS2,
                this.llrs
            ],
            [
                this.ANDS,
                this.lris
            ],
            [
                this.ANDS2,
                this.lrrs
            ],
            [
                this.ANDS,
                this.aris
            ],
            [
                this.ANDS2,
                this.arrs
            ],
            [
                this.ANDS,
                this.rris
            ],
            [
                this.ANDS2,
                this.rrrs
            ],
            [
                this.ANDS,
                this.llis
            ],
            [
                this.MULS,
                this.NOP
            ],
            [
                this.ANDS,
                this.lris
            ],
            [
                this.LDRH,
                this.ptrm
            ],
            [
                this.ANDS,
                this.aris
            ],
            [
                this.LDRSB,
                this.ptrm
            ],
            [
                this.ANDS,
                this.rris
            ],
            [
                this.LDRSH,
                this.ptrm
            ]
        ],
        //2
        [
            [
                this.EOR,
                this.lli
            ],
            [
                this.EOR2,
                this.llr
            ],
            [
                this.EOR,
                this.lri
            ],
            [
                this.EOR2,
                this.lrr
            ],
            [
                this.EOR,
                this.ari
            ],
            [
                this.EOR2,
                this.arr
            ],
            [
                this.EOR,
                this.rri
            ],
            [
                this.EOR2,
                this.rrr
            ],
            [
                this.EOR,
                this.lli
            ],
            [
                this.MLA,
                this.NOP
            ],
            [
                this.EOR,
                this.lri
            ],
            [
                this.STRH,
                this.ptrm
            ],
            [
                this.EOR,
                this.ari
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.EOR,
                this.rri
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //3
        [
            [
                this.EORS,
                this.llis
            ],
            [
                this.EORS2,
                this.llrs
            ],
            [
                this.EORS,
                this.lris
            ],
            [
                this.EORS2,
                this.lrrs
            ],
            [
                this.EORS,
                this.aris
            ],
            [
                this.EORS2,
                this.arrs
            ],
            [
                this.EORS,
                this.rris
            ],
            [
                this.EORS2,
                this.rrrs
            ],
            [
                this.EORS,
                this.llis
            ],
            [
                this.MLAS,
                this.NOP
            ],
            [
                this.EORS,
                this.lris
            ],
            [
                this.LDRH,
                this.ptrm
            ],
            [
                this.EORS,
                this.aris
            ],
            [
                this.LDRSB,
                this.ptrm
            ],
            [
                this.EORS,
                this.rris
            ],
            [
                this.LDRSH,
                this.ptrm
            ]
        ],
        //4
        [
            [
                this.SUB,
                this.lli
            ],
            [
                this.SUB2,
                this.llr
            ],
            [
                this.SUB,
                this.lri
            ],
            [
                this.SUB2,
                this.lrr
            ],
            [
                this.SUB,
                this.ari
            ],
            [
                this.SUB2,
                this.arr
            ],
            [
                this.SUB,
                this.rri
            ],
            [
                this.SUB2,
                this.rrr
            ],
            [
                this.SUB,
                this.lli
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.SUB,
                this.lri
            ],
            [
                this.STRH,
                this.ptim
            ],
            [
                this.SUB,
                this.ari
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.SUB,
                this.rri
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //5
        [
            [
                this.SUBS,
                this.lli
            ],
            [
                this.SUBS2,
                this.llr
            ],
            [
                this.SUBS,
                this.lri
            ],
            [
                this.SUBS2,
                this.lrr
            ],
            [
                this.SUBS,
                this.ari
            ],
            [
                this.SUBS2,
                this.arr
            ],
            [
                this.SUBS,
                this.rri
            ],
            [
                this.SUBS2,
                this.rrr
            ],
            [
                this.SUBS,
                this.lli
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.SUBS,
                this.lri
            ],
            [
                this.LDRH,
                this.ptim
            ],
            [
                this.SUBS,
                this.ari
            ],
            [
                this.LDRSB,
                this.ptim
            ],
            [
                this.SUBS,
                this.rri
            ],
            [
                this.LDRSH,
                this.ptim
            ]
        ],
        //6
        [
            [
                this.RSB,
                this.lli
            ],
            [
                this.RSB2,
                this.llr
            ],
            [
                this.RSB,
                this.lri
            ],
            [
                this.RSB2,
                this.lrr
            ],
            [
                this.RSB,
                this.ari
            ],
            [
                this.RSB2,
                this.arr
            ],
            [
                this.RSB,
                this.rri
            ],
            [
                this.RSB2,
                this.rrr
            ],
            [
                this.RSB,
                this.lli
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.RSB,
                this.lri
            ],
            [
                this.STRH,
                this.ptim
            ],
            [
                this.RSB,
                this.ari
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.RSB,
                this.rri
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //7
        [
            [
                this.RSBS,
                this.lli
            ],
            [
                this.RSBS2,
                this.llr
            ],
            [
                this.RSBS,
                this.lri
            ],
            [
                this.RSBS2,
                this.lrr
            ],
            [
                this.RSBS,
                this.ari
            ],
            [
                this.RSBS2,
                this.arr
            ],
            [
                this.RSBS,
                this.rri
            ],
            [
                this.RSBS2,
                this.rrr
            ],
            [
                this.RSBS,
                this.lli
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.RSBS,
                this.lri
            ],
            [
                this.LDRH,
                this.ptim
            ],
            [
                this.RSBS,
                this.ari
            ],
            [
                this.LDRSB,
                this.ptim
            ],
            [
                this.RSBS,
                this.rri
            ],
            [
                this.LDRSH,
                this.ptim
            ]
        ],
        //8
        [
            [
                this.ADD,
                this.lli
            ],
            [
                this.ADD2,
                this.llr
            ],
            [
                this.ADD,
                this.lri
            ],
            [
                this.ADD2,
                this.lrr
            ],
            [
                this.ADD,
                this.ari
            ],
            [
                this.ADD2,
                this.arr
            ],
            [
                this.ADD,
                this.rri
            ],
            [
                this.ADD2,
                this.rrr
            ],
            [
                this.ADD,
                this.lli
            ],
            [
                this.UMULL,
                this.NOP
            ],
            [
                this.ADD,
                this.lri
            ],
            [
                this.STRH,
                this.ptrp
            ],
            [
                this.ADD,
                this.ari
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.ADD,
                this.rri
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //9
        [
            [
                this.ADDS,
                this.lli
            ],
            [
                this.ADDS2,
                this.llr
            ],
            [
                this.ADDS,
                this.lri
            ],
            [
                this.ADDS2,
                this.lrr
            ],
            [
                this.ADDS,
                this.ari
            ],
            [
                this.ADDS2,
                this.arr
            ],
            [
                this.ADDS,
                this.rri
            ],
            [
                this.ADDS2,
                this.rrr
            ],
            [
                this.ADDS,
                this.lli
            ],
            [
                this.UMULLS,
                this.NOP
            ],
            [
                this.ADDS,
                this.lri
            ],
            [
                this.LDRH,
                this.ptrp
            ],
            [
                this.ADDS,
                this.ari
            ],
            [
                this.LDRSB,
                this.ptrp
            ],
            [
                this.ADDS,
                this.rri
            ],
            [
                this.LDRSH,
                this.ptrp
            ]
        ],
        //A
        [
            [
                this.ADC,
                this.lli
            ],
            [
                this.ADC2,
                this.llr
            ],
            [
                this.ADC,
                this.lri
            ],
            [
                this.ADC2,
                this.lrr
            ],
            [
                this.ADC,
                this.ari
            ],
            [
                this.ADC2,
                this.arr
            ],
            [
                this.ADC,
                this.rri
            ],
            [
                this.ADC2,
                this.rrr
            ],
            [
                this.ADC,
                this.lli
            ],
            [
                this.UMLAL,
                this.NOP
            ],
            [
                this.ADC,
                this.lri
            ],
            [
                this.STRH,
                this.ptrp
            ],
            [
                this.ADC,
                this.ari
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.ADC,
                this.rri
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //B
        [
            [
                this.ADCS,
                this.lli
            ],
            [
                this.ADCS2,
                this.llr
            ],
            [
                this.ADCS,
                this.lri
            ],
            [
                this.ADCS2,
                this.lrr
            ],
            [
                this.ADCS,
                this.ari
            ],
            [
                this.ADCS2,
                this.arr
            ],
            [
                this.ADCS,
                this.rri
            ],
            [
                this.ADCS2,
                this.rrr
            ],
            [
                this.ADCS,
                this.lli
            ],
            [
                this.UMLALS,
                this.NOP
            ],
            [
                this.ADCS,
                this.lri
            ],
            [
                this.LDRH,
                this.ptrp
            ],
            [
                this.ADCS,
                this.ari
            ],
            [
                this.LDRSB,
                this.ptrp
            ],
            [
                this.ADCS,
                this.rri
            ],
            [
                this.LDRSH,
                this.ptrp
            ]
        ],
        //C
        [
            [
                this.SBC,
                this.lli
            ],
            [
                this.SBC2,
                this.llr
            ],
            [
                this.SBC,
                this.lri
            ],
            [
                this.SBC2,
                this.lrr
            ],
            [
                this.SBC,
                this.ari
            ],
            [
                this.SBC2,
                this.arr
            ],
            [
                this.SBC,
                this.rri
            ],
            [
                this.SBC2,
                this.rrr
            ],
            [
                this.SBC,
                this.lli
            ],
            [
                this.SMULL,
                this.NOP
            ],
            [
                this.SBC,
                this.lri
            ],
            [
                this.STRH,
                this.ptip
            ],
            [
                this.SBC,
                this.ari
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.SBC,
                this.rri
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //D
        [
            [
                this.SBCS,
                this.lli
            ],
            [
                this.SBCS2,
                this.llr
            ],
            [
                this.SBCS,
                this.lri
            ],
            [
                this.SBCS2,
                this.lrr
            ],
            [
                this.SBCS,
                this.ari
            ],
            [
                this.SBCS2,
                this.arr
            ],
            [
                this.SBCS,
                this.rri
            ],
            [
                this.SBCS2,
                this.rrr
            ],
            [
                this.SBCS,
                this.lli
            ],
            [
                this.SMULLS,
                this.NOP
            ],
            [
                this.SBCS,
                this.lri
            ],
            [
                this.LDRH,
                this.ptip
            ],
            [
                this.SBCS,
                this.ari
            ],
            [
                this.LDRSB,
                this.ptip
            ],
            [
                this.SBCS,
                this.rri
            ],
            [
                this.LDRSH,
                this.ptip
            ]
        ],
        //E
        [
            [
                this.RSC,
                this.lli
            ],
            [
                this.RSC2,
                this.llr
            ],
            [
                this.RSC,
                this.lri
            ],
            [
                this.RSC2,
                this.lrr
            ],
            [
                this.RSC,
                this.ari
            ],
            [
                this.RSC2,
                this.arr
            ],
            [
                this.RSC,
                this.rri
            ],
            [
                this.RSC2,
                this.rrr
            ],
            [
                this.RSC,
                this.lli
            ],
            [
                this.SMLAL,
                this.NOP
            ],
            [
                this.RSC,
                this.lri
            ],
            [
                this.STRH,
                this.ptip
            ],
            [
                this.RSC,
                this.ari
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.RSC,
                this.rri
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //F
        [
            [
                this.RSCS,
                this.lli
            ],
            [
                this.RSCS2,
                this.llr
            ],
            [
                this.RSCS,
                this.lri
            ],
            [
                this.RSCS2,
                this.lrr
            ],
            [
                this.RSCS,
                this.ari
            ],
            [
                this.RSCS2,
                this.arr
            ],
            [
                this.RSCS,
                this.rri
            ],
            [
                this.RSCS2,
                this.rrr
            ],
            [
                this.RSCS,
                this.lli
            ],
            [
                this.SMLALS,
                this.NOP
            ],
            [
                this.RSCS,
                this.lri
            ],
            [
                this.LDRH,
                this.ptip
            ],
            [
                this.RSCS,
                this.ari
            ],
            [
                this.LDRSB,
                this.ptip
            ],
            [
                this.RSCS,
                this.rri
            ],
            [
                this.LDRSH,
                this.ptip
            ]
        ],
        //10
        [
            [
                this.MRS,
                this.rc
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.SWP,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.STRH,
                this.ofrm
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //11
        [
            [
                this.TSTS,
                this.llis
            ],
            [
                this.TSTS2,
                this.llrs
            ],
            [
                this.TSTS,
                this.lris
            ],
            [
                this.TSTS2,
                this.lrrs
            ],
            [
                this.TSTS,
                this.aris
            ],
            [
                this.TSTS2,
                this.arrs
            ],
            [
                this.TSTS,
                this.rris
            ],
            [
                this.TSTS2,
                this.rrrs
            ],
            [
                this.TSTS,
                this.llis
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.TSTS,
                this.lris
            ],
            [
                this.LDRH,
                this.ofrm
            ],
            [
                this.TSTS,
                this.aris
            ],
            [
                this.LDRSB,
                this.ofrm
            ],
            [
                this.TSTS,
                this.rris
            ],
            [
                this.LDRSH,
                this.ofrm
            ]
        ],
        //12
        [
            [
                this.MSR,
                this.rcs
            ],
            [
                this.BX,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.STRH,
                this.prrm
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //13
        [
            [
                this.TEQS,
                this.llis
            ],
            [
                this.TEQS2,
                this.llrs
            ],
            [
                this.TEQS,
                this.lris
            ],
            [
                this.TEQS2,
                this.lrrs
            ],
            [
                this.TEQS,
                this.aris
            ],
            [
                this.TEQS2,
                this.arrs
            ],
            [
                this.TEQS,
                this.rris
            ],
            [
                this.TEQS2,
                this.rrrs
            ],
            [
                this.TEQS,
                this.llis
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.TEQS,
                this.lris
            ],
            [
                this.LDRH,
                this.prrm
            ],
            [
                this.TEQS,
                this.aris
            ],
            [
                this.LDRSB,
                this.prrm
            ],
            [
                this.TEQS,
                this.rris
            ],
            [
                this.LDRSH,
                this.prrm
            ]
        ],
        //14
        [
            [
                this.MRS,
                this.rs
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.SWPB,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.STRH,
                this.ofim
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //15
        [
            [
                this.CMPS,
                this.lli
            ],
            [
                this.CMPS2,
                this.llr
            ],
            [
                this.CMPS,
                this.lri
            ],
            [
                this.CMPS2,
                this.lrr
            ],
            [
                this.CMPS,
                this.ari
            ],
            [
                this.CMPS2,
                this.arr
            ],
            [
                this.CMPS,
                this.rri
            ],
            [
                this.CMPS2,
                this.rrr
            ],
            [
                this.CMPS,
                this.lli
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.CMPS,
                this.lri
            ],
            [
                this.LDRH,
                this.ofim
            ],
            [
                this.CMPS,
                this.ari
            ],
            [
                this.LDRSB,
                this.ofim
            ],
            [
                this.CMPS,
                this.rri
            ],
            [
                this.LDRSH,
                this.ofim
            ]
        ],
        //16
        [
            [
                this.MSR,
                this.rss
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.STRH,
                this.prim
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //17
        [
            [
                this.CMNS,
                this.lli
            ],
            [
                this.CMNS2,
                this.llr
            ],
            [
                this.CMNS,
                this.lri
            ],
            [
                this.CMNS2,
                this.lrr
            ],
            [
                this.CMNS,
                this.ari
            ],
            [
                this.CMNS2,
                this.arr
            ],
            [
                this.CMNS,
                this.rri
            ],
            [
                this.CMNS2,
                this.rrr
            ],
            [
                this.CMNS,
                this.lli
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.CMNS,
                this.lri
            ],
            [
                this.LDRH,
                this.prim
            ],
            [
                this.CMNS,
                this.ari
            ],
            [
                this.LDRSB,
                this.prim
            ],
            [
                this.CMNS,
                this.rri
            ],
            [
                this.LDRSH,
                this.prim
            ]
        ],
        //18
        [
            [
                this.ORR,
                this.lli
            ],
            [
                this.ORR2,
                this.llr
            ],
            [
                this.ORR,
                this.lri
            ],
            [
                this.ORR2,
                this.lrr
            ],
            [
                this.ORR,
                this.ari
            ],
            [
                this.ORR2,
                this.arr
            ],
            [
                this.ORR,
                this.rri
            ],
            [
                this.ORR2,
                this.rrr
            ],
            [
                this.ORR,
                this.lli
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.ORR,
                this.lri
            ],
            [
                this.STRH,
                this.ofrp
            ],
            [
                this.ORR,
                this.ari
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.ORR,
                this.rri
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //19
        [
            [
                this.ORRS,
                this.llis
            ],
            [
                this.ORRS2,
                this.llrs
            ],
            [
                this.ORRS,
                this.lris
            ],
            [
                this.ORRS2,
                this.lrrs
            ],
            [
                this.ORRS,
                this.aris
            ],
            [
                this.ORRS2,
                this.arrs
            ],
            [
                this.ORRS,
                this.rris
            ],
            [
                this.ORRS2,
                this.rrrs
            ],
            [
                this.ORRS,
                this.llis
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.ORRS,
                this.lris
            ],
            [
                this.LDRH,
                this.ofrp
            ],
            [
                this.ORRS,
                this.aris
            ],
            [
                this.LDRSB,
                this.ofrp
            ],
            [
                this.ORRS,
                this.rris
            ],
            [
                this.LDRSH,
                this.ofrp
            ]
        ],
        //1A
        [
            [
                this.MOV,
                this.lli
            ],
            [
                this.MOV,
                this.llr
            ],
            [
                this.MOV,
                this.lri
            ],
            [
                this.MOV,
                this.lrr
            ],
            [
                this.MOV,
                this.ari
            ],
            [
                this.MOV,
                this.arr
            ],
            [
                this.MOV,
                this.rri
            ],
            [
                this.MOV,
                this.rrr
            ],
            [
                this.MOV,
                this.lli
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.MOV,
                this.lri
            ],
            [
                this.STRH,
                this.prrp
            ],
            [
                this.MOV,
                this.ari
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.MOV,
                this.rri
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //1B
        [
            [
                this.MOVS,
                this.llis
            ],
            [
                this.MOVS,
                this.llrs
            ],
            [
                this.MOVS,
                this.lris
            ],
            [
                this.MOVS,
                this.lrrs
            ],
            [
                this.MOVS,
                this.aris
            ],
            [
                this.MOVS,
                this.arrs
            ],
            [
                this.MOVS,
                this.rris
            ],
            [
                this.MOVS,
                this.rrrs
            ],
            [
                this.MOVS,
                this.llis
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.MOVS,
                this.lris
            ],
            [
                this.LDRH,
                this.prrp
            ],
            [
                this.MOVS,
                this.aris
            ],
            [
                this.LDRSB,
                this.prrp
            ],
            [
                this.MOVS,
                this.rris
            ],
            [
                this.LDRSH,
                this.prrp
            ]
        ],
        //1C
        [
            [
                this.BIC,
                this.lli
            ],
            [
                this.BIC2,
                this.llr
            ],
            [
                this.BIC,
                this.lri
            ],
            [
                this.BIC2,
                this.lrr
            ],
            [
                this.BIC,
                this.ari
            ],
            [
                this.BIC2,
                this.arr
            ],
            [
                this.BIC,
                this.rri
            ],
            [
                this.BIC2,
                this.rrr
            ],
            [
                this.BIC,
                this.lli
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.BIC,
                this.lri
            ],
            [
                this.STRH,
                this.ofip
            ],
            [
                this.BIC,
                this.ari
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.BIC,
                this.rri
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //1D
        [
            [
                this.BICS,
                this.llis
            ],
            [
                this.BICS2,
                this.llrs
            ],
            [
                this.BICS,
                this.lris
            ],
            [
                this.BICS2,
                this.lrrs
            ],
            [
                this.BICS,
                this.aris
            ],
            [
                this.BICS2,
                this.arrs
            ],
            [
                this.BICS,
                this.rris
            ],
            [
                this.BICS2,
                this.rrrs
            ],
            [
                this.BICS,
                this.llis
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.BICS,
                this.lris
            ],
            [
                this.LDRH,
                this.ofip
            ],
            [
                this.BICS,
                this.aris
            ],
            [
                this.LDRSB,
                this.ofip
            ],
            [
                this.BICS,
                this.rris
            ],
            [
                this.LDRSH,
                this.ofip
            ]
        ],
        //1E
        [
            [
                this.MVN,
                this.lli
            ],
            [
                this.MVN,
                this.llr
            ],
            [
                this.MVN,
                this.lri
            ],
            [
                this.MVN,
                this.lrr
            ],
            [
                this.MVN,
                this.ari
            ],
            [
                this.MVN,
                this.arr
            ],
            [
                this.MVN,
                this.rri
            ],
            [
                this.MVN,
                this.rrr
            ],
            [
                this.MVN,
                this.lli
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.MVN,
                this.lri
            ],
            [
                this.STRH,
                this.prip
            ],
            [
                this.MVN,
                this.ari
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.MVN,
                this.rri
            ],
            [
                this.UNDEFINED,
                this.NOP
            ]
        ],
        //1F
        [
            [
                this.MVNS,
                this.llis
            ],
            [
                this.MVNS,
                this.llrs
            ],
            [
                this.MVNS,
                this.lris
            ],
            [
                this.MVNS,
                this.lrrs
            ],
            [
                this.MVNS,
                this.aris
            ],
            [
                this.MVNS,
                this.arrs
            ],
            [
                this.MVNS,
                this.rris
            ],
            [
                this.MVNS,
                this.rrrs
            ],
            [
                this.MVNS,
                this.llis
            ],
            [
                this.UNDEFINED,
                this.NOP
            ],
            [
                this.MVNS,
                this.lris
            ],
            [
                this.LDRH,
                this.prip
            ],
            [
                this.MVNS,
                this.aris
            ],
            [
                this.LDRSB,
                this.prip
            ],
            [
                this.MVNS,
                this.rris
            ],
            [
                this.LDRSH,
                this.prip
            ]
        ],
        //20
        this.generateLowMap(this.AND, this.imm),
        //21
        this.generateLowMap(this.ANDS, this.imms),
        //22
        this.generateLowMap(this.EOR, this.imm),
        //23
        this.generateLowMap(this.EORS, this.imms),
        //24
        this.generateLowMap(this.SUB, this.imm),
        //25
        this.generateLowMap(this.SUBS, this.imm),
        //26
        this.generateLowMap(this.RSB, this.imm),
        //27
        this.generateLowMap(this.RSBS, this.imm),
        //28
        this.generateLowMap(this.ADD, this.imm),
        //29
        this.generateLowMap(this.ADDS, this.imm),
        //2A
        this.generateLowMap(this.ADC, this.imm),
        //2B
        this.generateLowMap(this.ADCS, this.imm),
        //2C
        this.generateLowMap(this.SBC, this.imm),
        //2D
        this.generateLowMap(this.SBCS, this.imm),
        //2E
        this.generateLowMap(this.RSC, this.imm),
        //2F
        this.generateLowMap(this.RSCS, this.imm),
        //30
        this.generateLowMap(this.UNDEFINED, this.NOP),
        //31
        this.generateLowMap(this.TSTS, this.imms),
        //32
        this.generateLowMap(this.MSR, this.ic),
        //33
        this.generateLowMap(this.TEQS, this.imms),
        //34
        this.generateLowMap(this.UNDEFINED, this.NOP),
        //35
        this.generateLowMap(this.CMPS, this.imm),
        //36
        this.generateLowMap(this.MSR, this.is),
        //37
        this.generateLowMap(this.CMNS, this.imm),
        //38
        this.generateLowMap(this.ORR, this.imm),
        //39
        this.generateLowMap(this.ORRS, this.imms),
        //3A
        this.generateLowMap(this.MOV, this.imm),
        //3B
        this.generateLowMap(this.MOVS, this.imms),
        //3C
        this.generateLowMap(this.BIC, this.imm),
        //3D
        this.generateLowMap(this.BICS, this.imms),
        //3E
        this.generateLowMap(this.MVN, this.imm),
        //3F
        this.generateLowMap(this.MVNS, this.imms),
        //40
        this.generateLowMap(this.STR, this.sptim),
        //41
        this.generateLowMap(this.LDR, this.sptim),
        //42
        this.generateLowMap(this.STRT, this.sptim),
        //43
        this.generateLowMap(this.LDRT, this.sptim),
        //44
        this.generateLowMap(this.STRB, this.sptim),
        //45
        this.generateLowMap(this.LDRB, this.sptim),
        //46
        this.generateLowMap(this.STRBT, this.sptim),
        //47
        this.generateLowMap(this.LDRBT, this.sptim),
        //48
        this.generateLowMap(this.STR, this.sptip),
        //49
        this.generateLowMap(this.LDR, this.sptip),
        //4A
        this.generateLowMap(this.STRT, this.sptip),
        //4B
        this.generateLowMap(this.LDRT, this.sptip),
        //4C
        this.generateLowMap(this.STRB, this.sptip),
        //4D
        this.generateLowMap(this.LDRB, this.sptip),
        //4E
        this.generateLowMap(this.STRBT, this.sptip),
        //4F
        this.generateLowMap(this.LDRBT, this.sptip),
        //50
        this.generateLowMap(this.STR, this.sofim),
        //51
        this.generateLowMap(this.LDR, this.sofim),
        //52
        this.generateLowMap(this.STR, this.sprim),
        //53
        this.generateLowMap(this.LDR, this.sprim),
        //54
        this.generateLowMap(this.STRB, this.sofim),
        //55
        this.generateLowMap(this.LDRB, this.sofim),
        //56
        this.generateLowMap(this.STRB, this.sprim),
        //57
        this.generateLowMap(this.LDRB, this.sprim),
        //58
        this.generateLowMap(this.STR, this.sofip),
        //59
        this.generateLowMap(this.LDR, this.sofip),
        //5A
        this.generateLowMap(this.STR, this.sprip),
        //5B
        this.generateLowMap(this.LDR, this.sprip),
        //5C
        this.generateLowMap(this.STRB, this.sofip),
        //5D
        this.generateLowMap(this.LDRB, this.sofip),
        //5E
        this.generateLowMap(this.STRB, this.sprip),
        //5F
        this.generateLowMap(this.LDRB, this.sprip),
    ];
    //60-6F
    this.generateStoreLoadInstructionSector1(instructionMap);
    //70-7F
    this.generateStoreLoadInstructionSector2(instructionMap);
    instructionMap = instructionMap.concat([
        //80
        this.generateLowMap(this.STMDA, this.guardRegisterReadSTM),
        //81
        this.generateLowMap(this.LDMDA, this.guardRegisterWriteLDM),
        //82
        this.generateLowMap(this.STMDAW, this.guardRegisterReadSTM),
        //83
        this.generateLowMap(this.LDMDAW, this.guardRegisterWriteLDM),
        //84
        this.generateLowMap(this.STMDA, this.guardUserRegisterReadSTM),
        //85
        this.generateLowMap(this.LDMDA, this.guardUserRegisterWriteLDM),
        //86
        this.generateLowMap(this.STMDAW, this.guardUserRegisterReadSTM),
        //87
        this.generateLowMap(this.LDMDAW, this.guardUserRegisterWriteLDM),
        //88
        this.generateLowMap(this.STMIA, this.guardRegisterReadSTM),
        //89
        this.generateLowMap(this.LDMIA, this.guardRegisterWriteLDM),
        //8A
        this.generateLowMap(this.STMIAW, this.guardRegisterReadSTM),
        //8B
        this.generateLowMap(this.LDMIAW, this.guardRegisterWriteLDM),
        //8C
        this.generateLowMap(this.STMIA, this.guardUserRegisterReadSTM),
        //8D
        this.generateLowMap(this.LDMIA, this.guardUserRegisterWriteLDM),
        //8E
        this.generateLowMap(this.STMIAW, this.guardUserRegisterReadSTM),
        //8F
        this.generateLowMap(this.LDMIAW, this.guardUserRegisterWriteLDM),
        //90
        this.generateLowMap(this.STMDB, this.guardRegisterReadSTM),
        //91
        this.generateLowMap(this.LDMDB, this.guardRegisterWriteLDM),
        //92
        this.generateLowMap(this.STMDBW, this.guardRegisterReadSTM),
        //93
        this.generateLowMap(this.LDMDBW, this.guardRegisterWriteLDM),
        //94
        this.generateLowMap(this.STMDB, this.guardUserRegisterReadSTM),
        //95
        this.generateLowMap(this.LDMDB, this.guardUserRegisterWriteLDM),
        //96
        this.generateLowMap(this.STMDBW, this.guardUserRegisterReadSTM),
        //97
        this.generateLowMap(this.LDMDBW, this.guardUserRegisterWriteLDM),
        //98
        this.generateLowMap(this.STMIB, this.guardRegisterReadSTM),
        //99
        this.generateLowMap(this.LDMIB, this.guardRegisterWriteLDM),
        //9A
        this.generateLowMap(this.STMIBW, this.guardRegisterReadSTM),
        //9B
        this.generateLowMap(this.LDMIBW, this.guardRegisterWriteLDM),
        //9C
        this.generateLowMap(this.STMIB, this.guardUserRegisterReadSTM),
        //9D
        this.generateLowMap(this.LDMIB, this.guardUserRegisterWriteLDM),
        //9E
        this.generateLowMap(this.STMIBW, this.guardUserRegisterReadSTM),
        //9F
        this.generateLowMap(this.LDMIBW, this.guardUserRegisterWriteLDM),
        //A0
        this.generateLowMap(this.B, this.NOP),
        //A1
        this.generateLowMap(this.B, this.NOP),
        //A2
        this.generateLowMap(this.B, this.NOP),
        //A3
        this.generateLowMap(this.B, this.NOP),
        //A4
        this.generateLowMap(this.B, this.NOP),
        //A5
        this.generateLowMap(this.B, this.NOP),
        //A6
        this.generateLowMap(this.B, this.NOP),
        //A7
        this.generateLowMap(this.B, this.NOP),
        //A8
        this.generateLowMap(this.B, this.NOP),
        //A9
        this.generateLowMap(this.B, this.NOP),
        //AA
        this.generateLowMap(this.B, this.NOP),
        //AB
        this.generateLowMap(this.B, this.NOP),
        //AC
        this.generateLowMap(this.B, this.NOP),
        //AD
        this.generateLowMap(this.B, this.NOP),
        //AE
        this.generateLowMap(this.B, this.NOP),
        //AF
        this.generateLowMap(this.B, this.NOP),
        //B0
        this.generateLowMap(this.BL, this.NOP),
        //B1
        this.generateLowMap(this.BL, this.NOP),
        //B2
        this.generateLowMap(this.BL, this.NOP),
        //B3
        this.generateLowMap(this.BL, this.NOP),
        //B4
        this.generateLowMap(this.BL, this.NOP),
        //B5
        this.generateLowMap(this.BL, this.NOP),
        //B6
        this.generateLowMap(this.BL, this.NOP),
        //B7
        this.generateLowMap(this.BL, this.NOP),
        //B8
        this.generateLowMap(this.BL, this.NOP),
        //B9
        this.generateLowMap(this.BL, this.NOP),
        //BA
        this.generateLowMap(this.BL, this.NOP),
        //BB
        this.generateLowMap(this.BL, this.NOP),
        //BC
        this.generateLowMap(this.BL, this.NOP),
        //BD
        this.generateLowMap(this.BL, this.NOP),
        //BE
        this.generateLowMap(this.BL, this.NOP),
        //BF
        this.generateLowMap(this.BL, this.NOP),
        //C0
        this.generateLowMap(this.STC, this.ofm),
        //C1
        this.generateLowMap(this.LDC, this.ofm),
        //C2
        this.generateLowMap(this.STC, this.prm),
        //C3
        this.generateLowMap(this.LDC, this.prm),
        //C4
        this.generateLowMap(this.STC, this.ofm),
        //C5
        this.generateLowMap(this.LDC, this.ofm),
        //C6
        this.generateLowMap(this.STC, this.prm),
        //C7
        this.generateLowMap(this.LDC, this.prm),
        //C8
        this.generateLowMap(this.STC, this.ofp),
        //C9
        this.generateLowMap(this.LDC, this.ofp),
        //CA
        this.generateLowMap(this.STC, this.prp),
        //CB
        this.generateLowMap(this.LDC, this.prp),
        //CC
        this.generateLowMap(this.STC, this.ofp),
        //CD
        this.generateLowMap(this.LDC, this.ofp),
        //CE
        this.generateLowMap(this.STC, this.prp),
        //CF
        this.generateLowMap(this.LDC, this.prp),
        //D0
        this.generateLowMap(this.STC, this.unm),
        //D1
        this.generateLowMap(this.LDC, this.unm),
        //D2
        this.generateLowMap(this.STC, this.ptm),
        //D3
        this.generateLowMap(this.LDC, this.ptm),
        //D4
        this.generateLowMap(this.STC, this.unm),
        //D5
        this.generateLowMap(this.LDC, this.unm),
        //D6
        this.generateLowMap(this.STC, this.ptm),
        //D7
        this.generateLowMap(this.LDC, this.ptm),
        //D8
        this.generateLowMap(this.STC, this.unp),
        //D9
        this.generateLowMap(this.LDC, this.unp),
        //DA
        this.generateLowMap(this.STC, this.ptp),
        //DB
        this.generateLowMap(this.LDC, this.ptp),
        //DC
        this.generateLowMap(this.STC, this.unp),
        //DD
        this.generateLowMap(this.LDC, this.unp),
        //DE
        this.generateLowMap(this.STC, this.ptp),
        //DF
        this.generateLowMap(this.LDC, this.ptp),
        //E0
        this.generateLowMap2(this.CDP, this.MCR),
        //E1
        this.generateLowMap2(this.CDP, this.MRC),
        //E2
        this.generateLowMap2(this.CDP, this.MCR),
        //E3
        this.generateLowMap2(this.CDP, this.MRC),
        //E4
        this.generateLowMap2(this.CDP, this.MCR),
        //E5
        this.generateLowMap2(this.CDP, this.MRC),
        //E6
        this.generateLowMap2(this.CDP, this.MCR),
        //E7
        this.generateLowMap2(this.CDP, this.MRC),
        //E8
        this.generateLowMap2(this.CDP, this.MCR),
        //E9
        this.generateLowMap2(this.CDP, this.MRC),
        //EA
        this.generateLowMap2(this.CDP, this.MCR),
        //EB
        this.generateLowMap2(this.CDP, this.MRC),
        //EC
        this.generateLowMap2(this.CDP, this.MCR),
        //ED
        this.generateLowMap2(this.CDP, this.MRC),
        //EE
        this.generateLowMap2(this.CDP, this.MCR),
        //EF
        this.generateLowMap2(this.CDP, this.MRC),
        //F0
        this.generateLowMap(this.SWI, this.NOP),
        //F1
        this.generateLowMap(this.SWI, this.NOP),
        //F2
        this.generateLowMap(this.SWI, this.NOP),
        //F3
        this.generateLowMap(this.SWI, this.NOP),
        //F4
        this.generateLowMap(this.SWI, this.NOP),
        //F5
        this.generateLowMap(this.SWI, this.NOP),
        //F6
        this.generateLowMap(this.SWI, this.NOP),
        //F7
        this.generateLowMap(this.SWI, this.NOP),
        //F8
        this.generateLowMap(this.SWI, this.NOP),
        //F9
        this.generateLowMap(this.SWI, this.NOP),
        //FA
        this.generateLowMap(this.SWI, this.NOP),
        //FB
        this.generateLowMap(this.SWI, this.NOP),
        //FC
        this.generateLowMap(this.SWI, this.NOP),
        //FD
        this.generateLowMap(this.SWI, this.NOP),
        //FE
        this.generateLowMap(this.SWI, this.NOP),
        //FF
        this.generateLowMap(this.SWI, this.NOP)
    ]);
    return instructionMap;
}
ARMInstructionSet.prototype.generateLowMap = function (instructionOpcode, dataOpcode) {
    return [
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ],
        [
            instructionOpcode,
            dataOpcode
        ]
    ];
}
ARMInstructionSet.prototype.generateLowMap2 = function (instructionOpcode, instructionOpcode2) {
    return [
        [
            instructionOpcode,
            this.NOP
        ],
        [
            instructionOpcode2,
            this.NOP
        ],
        [
            instructionOpcode,
            this.NOP
        ],
        [
            instructionOpcode2,
            this.NOP
        ],
        [
            instructionOpcode,
            this.NOP
        ],
        [
            instructionOpcode2,
            this.NOP
        ],
        [
            instructionOpcode,
            this.NOP
        ],
        [
            instructionOpcode2,
            this.NOP
        ],
        [
            instructionOpcode,
            this.NOP
        ],
        [
            instructionOpcode2,
            this.NOP
        ],
        [
            instructionOpcode,
            this.NOP
        ],
        [
            instructionOpcode2,
            this.NOP
        ],
        [
            instructionOpcode,
            this.NOP
        ],
        [
            instructionOpcode2,
            this.NOP
        ],
        [
            instructionOpcode,
            this.NOP
        ],
        [
            instructionOpcode2,
            this.NOP
        ]
    ];
}
ARMInstructionSet.prototype.generateStoreLoadInstructionSector1 = function (instructionMap) {
    var instrMap = [
        this.STR,
        this.LDR,
        this.STRT,
        this.LDRT,
        this.STRB,
        this.LDRB,
        this.STRBT,
        this.LDRBT
    ];
    var dataMap = [
        this.ptrmll,
        this.ptrmlr,
        this.ptrmar,
        this.ptrmrr,
        this.ptrpll,
        this.ptrplr,
        this.ptrpar,
        this.ptrprr
    ];
    for (var instrIndex = 0; instrIndex < 0x10; ++instrIndex) {
        var lowMap = [];
        for (var dataIndex = 0; dataIndex < 0x10; ++dataIndex) {
            if ((dataIndex & 0x1) == 0) {
                lowMap.push([
                    instrMap[instrIndex & 0x7],
                    dataMap[((dataIndex >> 1) & 0x3) | ((instrIndex & 0x8) >> 1)]
                ]);
            }
            else {
                lowMap.push([
                    this.UNDEFINED,
                    this.NOP
                ]);
            }
        }
        instructionMap.push(lowMap);
    }
}
ARMInstructionSet.prototype.generateStoreLoadInstructionSector2 = function (instructionMap) {
    var instrMap = [
        this.STR,
        this.LDR,
        this.STRB,
        this.LDRB
    ];
    var dataMap = [
        [
            this.ofrmll,
            this.ofrmlr,
            this.ofrmar,
            this.ofrmrr
        ],
        [
            this.prrmll,
            this.prrmlr,
            this.prrmar,
            this.prrmrr
        ],
        [
            this.ofrpll,
            this.ofrplr,
            this.ofrpar,
            this.ofrprr
        ],
        [
            this.prrpll,
            this.prrplr,
            this.prrpar,
            this.prrprr
        ]
    ];
    for (var instrIndex = 0; instrIndex < 0x10; ++instrIndex) {
        var lowMap = [];
        for (var dataIndex = 0; dataIndex < 0x10; ++dataIndex) {
            if ((dataIndex & 0x1) == 0) {
                lowMap.push([
                    instrMap[((instrIndex >> 1) & 0x2) | (instrIndex & 0x1)],
                    dataMap[((instrIndex & 0x8) >> 2) | ((instrIndex & 0x2) >> 1)][(dataIndex >> 1) & 0x3]
                ]);
            }
            else {
                lowMap.push([
                    this.UNDEFINED,
                    this.NOP
                ]);
            }
        }
        instructionMap.push(lowMap);
    }
}
ARMInstructionSet.prototype.compileReducedInstructionMap = function (instructionMap) {
    //Flatten the multi-dimensional decode array:
    this.instructionMap = [];
    for (var conditionCode = 0; conditionCode < 0x10; ++conditionCode) {
        for (var range1 = 0; range1 < 0x100; ++range1) {
            var instrDecoded = instructionMap[range1];
            for (var range2 = 0; range2 < 0x10; ++range2) {
                var instructionCombo = instrDecoded[range2];
                this.instructionMap.push(this.appendInstruction(this, this.CPSR, conditionCode | 0, instructionCombo[0], instructionCombo[1]));
            }
        }
    }
    //Force length to be ready only:
    try {
        Object.defineProperty(this.instructionMap, "length", {writable: false});
    }
    catch (error) {
        //Some browsers throw here....
    }
}
ARMInstructionSet.prototype.appendInstruction = function (parentObj, CPSR, conditionCode, decodedInstr, decodedOperand) {
    switch (conditionCode & 0xF) {
        case 0x0:        //EQ (equal)
            return function () {
                if (CPSR.getZero()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0x1:        //NE (not equal)
            return function () {
                if (!CPSR.getZero()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0x2:        //CS (unsigned higher or same)
            return function () {
                if (CPSR.getCarry()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0x3:        //CC (unsigned lower)
            return function () {
                if (!CPSR.getCarry()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0x4:        //MI (negative)
            return function () {
                if (CPSR.getNegative()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0x5:        //PL (positive or zero)
            return function () {
                if (!CPSR.getNegative()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0x6:        //VS (overflow)
            return function () {
                if (CPSR.getOverflow()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0x7:        //VC (no overflow)
            return function () {
                if (!CPSR.getOverflow()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0x8:        //HI (unsigned higher)
            return function () {
                if (CPSR.getCarry() && !CPSR.getZero()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0x9:        //LS (unsigned lower or same)
            return function () {
                if (!CPSR.getCarry() || CPSR.getZero()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0xA:        //GE (greater or equal)
            return function () {
                if (CPSR.getNegative() == CPSR.getOverflow()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0xB:        //LT (less than)
            return function () {
                if (CPSR.getNegative() != CPSR.getOverflow()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0xC:        //GT (greater than)
            return function () {
                if (!CPSR.getZero() && CPSR.getNegative() == CPSR.getOverflow()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0xD:        //LE (less than or equal)
            return function () {
                if (CPSR.getZero() || CPSR.getNegative() != CPSR.getOverflow()) {
                    decodedInstr(parentObj, decodedOperand);
                }
            }
        case 0xE:        //AL (always)
            return function () {
                decodedInstr(parentObj, decodedOperand);
            }
        case 0xF:        //Reserved (Never Execute)
        default:
            return function () {};
    }
}