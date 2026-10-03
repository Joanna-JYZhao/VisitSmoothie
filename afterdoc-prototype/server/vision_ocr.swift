import Foundation
import ImageIO
import Vision

guard CommandLine.arguments.count == 2 else { exit(2) }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      CGImageSourceGetCount(source) > 0,
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { exit(2) }

guard image.width > 0, image.height > 0,
      image.width <= 12000, image.height <= 12000,
      Int64(image.width) * Int64(image.height) <= 50_000_000 else { exit(3) }

let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any]
let orientationNumber = properties?[kCGImagePropertyOrientation] as? NSNumber
let orientation = CGImagePropertyOrientation(rawValue: orientationNumber?.uint32Value ?? 1) ?? .up

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["zh-Hans", "en-US"]
request.usesLanguageCorrection = true

do {
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
    try handler.perform([request])
    let observations = (request.results ?? []).sorted {
        let verticalGap = abs($0.boundingBox.midY - $1.boundingBox.midY)
        if verticalGap > 0.02 { return $0.boundingBox.midY > $1.boundingBox.midY }
        return $0.boundingBox.minX < $1.boundingBox.minX
    }
    let lines = observations.compactMap { $0.topCandidates(1).first?.string }
    FileHandle.standardOutput.write(lines.joined(separator: "\n").data(using: .utf8) ?? Data())
} catch {
    exit(4)
}
