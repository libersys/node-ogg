import Debug from 'debug';
import { Readable } from 'stream';

import OggPacket from './OggPacket';
import binding from './binding';

const debug = Debug('ogg:decoder');

/**
 * The `DecoderStream` class is what gets passed in for the `Decoder` class'
 * "stream" event. You should not need to create instances of `DecoderStream`
 * manually.
 */
export class DecoderStream extends Readable {
    public readonly packets: OggPacket[] = [];
    public readonly serialno: number;
    public readonly os: Buffer;

    constructor(serialno: number) {
        super({ objectMode: true, highWaterMark: 0 });

        // array of `OggPacket` instances to output for the _read() function
        this.packets = [];
        this.serialno = serialno;

        this.os = new Buffer(binding.sizeof_ogg_stream_state);
        var r = binding.ogg_stream_init(this.os, serialno);
        if (0 !== r) {
            throw new Error('ogg_stream_init() failed: ' + r);
        }
    }

    /**
     * Pushes the next "packet" from the "packets" array, otherwise waits for an
     * "_packet" event.
     */
    _read(size: number) {
        debug('_read(%d packets)', size);
        const onpacket = () => {
            const packet: OggPacket | undefined = this.packets.shift();
            const callback = packet?._callback;
            if (packet) packet._callback = null;

            this.push(packet);

            if (callback) process.nextTick(callback);
        };
        if (this.packets.length > 0) {
            onpacket.call(this);
        } else {
            this.once('_packet', onpacket);
        }
    }

    // /**
    //  * Calls `ogg_stream_pagein()` on this OggStream.
    //  * Internal function used by the `Decoder` class.
    //  *
    //  * @param {Buffer} page `ogg_page` instance
    //  * @param {Number} packets the number of `OggPacket` instances in the page
    //  * @param {Function} fn callback function
    //  */
    pagein(page: Buffer, packets: number, callback: any) {
        debug('pagein(%d packets)', packets);

        var os = this.os;
        var packet: OggPacket;

        const afterPagein = (r: number) => {
            if (0 === r) {
                // `ogg_page` has been submitted, now emit a "page" event
                this.emit('page', page);
                // now read out the packets and push them onto this Readable stream
                packetout();
            } else {
                callback(new Error('ogg_stream_pagein() error: ' + r));
            }
        };

        const packetout = () => {
            debug('packetout(), %d packets left', packets);
            if (0 === packets) {
                // no more packets to read out, we're done...
                callback();
            } else {
                packet = new OggPacket();
                binding.ogg_stream_packetout(os, packet, afterPacketout);
            }
        };

        const afterPacketout = (rtn: any, bytes: any, b_o_s: any, e_o_s: any, granulepos: any, packetno: any) => {
            debug('afterPacketout(%d, %d, %d, %d, %d, %d)', rtn, bytes, b_o_s, e_o_s, granulepos, packetno);
            if (1 === rtn) {
                // got a packet...

                // since libogg takes control of the `packet`s "packet" data field, we must
                // copy it over to a Node.js buffer and change the pointer over. That way,
                // the `packet` Buffer is *completely* managed by the JS garbage collector
                packet.replace();

                if (b_o_s) {
                    this.emit('bos');
                }
                packet._callback = afterPacketRead;
                this.packets.push(packet);
                this.emit('_packet');
            } else if (-1 === rtn) {
                // libogg issued a sync warning, usually recoverable, try it again.
                // http://xiph.org/ogg/doc/libogg/ogg_stream_packetout.html
                packetout();
            } else {
                // libogg returned an unrecoverable error
                callback(new Error('ogg_stream_packetout() error: ' + rtn));
            }
        };

        const afterPacketRead = (err: Error) => {
            debug('afterPacketRead(%s)', err);
            if (err) return callback(err);
            if (packet.e_o_s) {
                this.emit('eos');
                this.push(null); // emit "end"
            }
            --packets;
            // read out the next packet from the stream
            packetout();
        };

        binding.ogg_stream_pagein(os, page, afterPagein);
    }
}

export default DecoderStream;

// /**
//  * We have to overwrite the "on()" function to reinterpret "packet" event names as
//  * "data" event names. Attaching a "packet" event listener will put the stream
//  * into streams2 "old-mode".
//  *
//  * @api public
//  */

// DecoderStream.prototype.on = function (ev, fn) {
//     if ('packet' == ev) {
//         debug('on(): remapping "packet" event listener as "data" event listener');
//         ev = 'data';
//     }
//     return Readable.prototype.on.call(this, ev, fn);
// };
// DecoderStream.prototype.addListener = DecoderStream.prototype.on;

// DecoderStream.prototype.once = function (ev, fn) {
//     if ('packet' == ev) {
//         debug('once(): remapping "packet" event listener as "data" event listener');
//         ev = 'data';
//     }
//     return Readable.prototype.once.call(this, ev, fn);
// };

// DecoderStream.prototype.removeListener = function (ev, fn) {
//     if ('packet' == ev) {
//         debug('removeListener(): remapping "packet" event listener as "data" event listener');
//         ev = 'data';
//     }
//     return Readable.prototype.removeListener.call(this, ev, fn);
// };
