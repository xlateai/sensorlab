import Foundation

class FloatRingBuffer {
    private var buffer: [Float]
    private let capacity: Int
    private var writeIndex: Int = 0
    private var readIndex: Int = 0
    private var count_: Int = 0
    private let lock = DispatchSemaphore(value: 1)

    init(capacity: Int) {
        self.capacity = capacity
        self.buffer = [Float](repeating: 0, count: capacity)
    }

    var count: Int {
        return count_
    }

    func write(_ samples: [Float]) {
        lock.wait()
        defer { lock.signal() }
        for sample in samples {
            if count_ < capacity {
                buffer[writeIndex] = sample
                writeIndex = (writeIndex + 1) % capacity
                count_ += 1
            } else {
                // overflow: drop extra samples
                break
            }
        }
    }

    func read(count: Int) -> [Float] {
        lock.wait()
        defer { lock.signal() }
        var out: [Float] = []
        for _ in 0..<count {
            if count_ > 0 {
                out.append(buffer[readIndex])
                readIndex = (readIndex + 1) % capacity
                count_ -= 1
            } else {
                // underrun: output silence
                out.append(0.0)
            }
        }
        return out
    }
}
