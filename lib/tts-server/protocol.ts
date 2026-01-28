
export function createPacket(type: 1 | 2, data: Uint8Array): Uint8Array {
    // Protocol: [Type(1)][Length(4)][Data]
    const length = data.length;
    const packet = new Uint8Array(1 + 4 + length);
    const view = new DataView(packet.buffer);

    view.setUint8(0, type); // 1 = Text, 2 = Audio
    view.setUint32(1, length, false); // Big Endian
    packet.set(data, 5);

    return packet;
}
