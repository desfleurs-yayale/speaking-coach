import Foundation
import CoreGraphics
import CoreImage
import ImageIO
import UniformTypeIdentifiers

struct RNG {
    var state: UInt64
    mutating func next() -> Double {
        state = state &* 6364136223846793005 &+ 1442695040888963407
        return Double((state >> 11) & 0x1fffffffffffff) / Double(0x1fffffffffffff)
    }
    mutating func range(_ a: CGFloat, _ b: CGFloat) -> CGFloat {
        a + CGFloat(next()) * (b - a)
    }
    mutating func int(_ a: Int, _ b: Int) -> Int {
        a + Int(next() * Double(b - a + 1))
    }
}

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let outputRoot = root.appendingPathComponent("public/assets/dream", isDirectory: true)
let sceneRoot = outputRoot.appendingPathComponent("scenes", isDirectory: true)
let cardRoot = outputRoot.appendingPathComponent("cards", isDirectory: true)
try FileManager.default.createDirectory(at: sceneRoot, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: cardRoot, withIntermediateDirectories: true)

let ciContext = CIContext(options: [.useSoftwareRenderer: false])

func makeContext(width: Int, height: Int) -> CGContext {
    CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
              bytesPerRow: width * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
}

func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
    CGColor(red: r, green: g, blue: b, alpha: a)
}

func linearGradient(_ ctx: CGContext, rect: CGRect, top: CGColor, bottom: CGColor) {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let gradient = CGGradient(colorsSpace: space, colors: [top, bottom] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(gradient, start: CGPoint(x: rect.midX, y: rect.maxY),
                           end: CGPoint(x: rect.midX, y: rect.minY), options: [])
}

func radial(_ ctx: CGContext, center: CGPoint, radius: CGFloat, inner: CGColor, outer: CGColor) {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let gradient = CGGradient(colorsSpace: space, colors: [inner, outer] as CFArray, locations: [0, 1])!
    ctx.drawRadialGradient(gradient, startCenter: center, startRadius: 0,
                           endCenter: center, endRadius: radius, options: [])
}

func softGlow(_ ctx: CGContext, center: CGPoint, radius: CGFloat, tint: CGColor, alpha: CGFloat = 1) {
    // CoreGraphics' transparent radial stop can produce a hard circular edge in JPEG output.
    // Keep the call site expressive while relying on the layered cloud and grain passes for haze.
}

func blurred(_ image: CGImage, radius: CGFloat) -> CGImage? {
    let input = CIImage(cgImage: image)
    guard let filter = CIFilter(name: "CIGaussianBlur") else { return image }
    filter.setValue(input, forKey: kCIInputImageKey)
    filter.setValue(radius, forKey: kCIInputRadiusKey)
    guard let output = filter.outputImage else { return image }
    return ciContext.createCGImage(output.cropped(to: input.extent), from: input.extent)
}

func drawCloud(_ ctx: CGContext, at x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat,
               opacity: CGFloat, rng: inout RNG) {
    ctx.saveGState()
    ctx.setAlpha(opacity)
    let base = CGRect(x: x, y: y + height * 0.47, width: width, height: height * 0.40)
    ctx.setFillColor(color(0.82, 0.91, 0.98, 0.38))
    ctx.fillEllipse(in: base.insetBy(dx: -width * 0.06, dy: -height * 0.04))
    let count = max(5, Int(width / 95))
    for i in 0..<count {
        let t = CGFloat(i) / CGFloat(max(1, count - 1))
        let px = x + t * width + rng.range(-width * 0.08, width * 0.08)
        let pw = width * rng.range(0.18, 0.38)
        let ph = height * rng.range(0.34, 0.68)
        let py = y + height * rng.range(0.10, 0.34)
        ctx.saveGState()
        ctx.setShadow(offset: CGSize(width: 0, height: -height * 0.015), blur: height * 0.028,
                      color: color(0.98, 0.995, 1, 0.22))
        ctx.setFillColor(color(0.97, 0.995, 1, 0.68))
        ctx.fillEllipse(in: CGRect(x: px, y: py, width: pw, height: ph))
        ctx.restoreGState()
    }
    ctx.restoreGState()
}

func addCloudField(_ ctx: CGContext, width: CGFloat, height: CGFloat, rng: inout RNG, dusk: Bool = false) {
    let count = dusk ? 13 : 12
    for _ in 0..<count {
        let w = rng.range(width * 0.14, width * 0.34)
        let h = rng.range(height * 0.08, height * 0.18)
        let x = rng.range(-width * 0.10, width * 0.90)
        let y = rng.range(height * 0.53, height * 0.91)
        drawCloud(ctx, at: x, y: y, width: w, height: h, opacity: rng.range(0.52, 0.93), rng: &rng)
    }
}

func addGrain(_ ctx: CGContext, width: Int, height: Int, rng: inout RNG, amount: Int = 1800) {
    ctx.saveGState()
    ctx.setBlendMode(.screen)
    for _ in 0..<amount {
        let x = rng.range(0, CGFloat(width))
        let y = rng.range(0, CGFloat(height))
        let r = rng.range(0.22, 1.1)
        let a = rng.range(0.025, 0.09)
        ctx.setFillColor(color(1, 1, 1, a))
        ctx.fillEllipse(in: CGRect(x: x, y: y, width: r, height: r))
    }
    ctx.restoreGState()
}

func addBirds(_ ctx: CGContext, width: CGFloat, height: CGFloat, rng: inout RNG, count: Int) {
    ctx.saveGState()
    ctx.setStrokeColor(color(1, 1, 1, 0.70))
    ctx.setLineWidth(max(1.0, width / 1400))
    ctx.setLineCap(.round)
    for _ in 0..<count {
        let x = rng.range(width * 0.06, width * 0.94)
        let y = rng.range(height * 0.48, height * 0.83)
        let s = rng.range(width * 0.004, width * 0.012)
        let p = CGMutablePath()
        p.move(to: CGPoint(x: x - s, y: y))
        p.addQuadCurve(to: CGPoint(x: x, y: y + s * 0.24), control: CGPoint(x: x - s * 0.48, y: y + s * 0.70))
        p.addQuadCurve(to: CGPoint(x: x + s, y: y), control: CGPoint(x: x + s * 0.48, y: y + s * 0.70))
        ctx.addPath(p)
        ctx.strokePath()
    }
    ctx.restoreGState()
}

func vignette(_ ctx: CGContext, width: CGFloat, height: CGFloat) {
    // Omit the radial vignette because CoreGraphics can quantize its transparent stop
    // into a visible disc when the bitmap is encoded as JPEG.
}

func saveJPEG(_ image: CGImage, to url: URL, quality: CGFloat = 0.78) throws {
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
        throw NSError(domain: "DreamAssets", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not create JPEG destination"])
    }
    CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
    guard CGImageDestinationFinalize(destination) else {
        throw NSError(domain: "DreamAssets", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not finalize JPEG"])
    }
}

func renderScene(kind: String, seed: UInt64) throws {
    let width: CGFloat = 1920, height: CGFloat = 1080
    var rng = RNG(state: seed)
    let ctx = makeContext(width: Int(width), height: Int(height))
    let rect = CGRect(x: 0, y: 0, width: width, height: height)
    switch kind {
    case "sky":
        linearGradient(ctx, rect: rect, top: color(0.08, 0.39, 0.86), bottom: color(0.48, 0.84, 1.0))
        addCloudField(ctx, width: CGFloat(width), height: CGFloat(height), rng: &rng)
        addBirds(ctx, width: CGFloat(width), height: CGFloat(height), rng: &rng, count: 8)
        softGlow(ctx, center: CGPoint(x: 430, y: 820), radius: 420, tint: color(0.55, 0.90, 1, 0.18), alpha: 0.8)
    case "meadow":
        linearGradient(ctx, rect: rect, top: color(0.10, 0.47, 0.91), bottom: color(0.55, 0.88, 1.0))
        addCloudField(ctx, width: CGFloat(width), height: CGFloat(height), rng: &rng)
        let hill = CGMutablePath()
        hill.move(to: CGPoint(x: 0, y: 0))
        hill.addLine(to: CGPoint(x: width, y: 0))
        hill.addLine(to: CGPoint(x: width, y: height * 0.38))
        hill.addCurve(to: CGPoint(x: 0, y: height * 0.29), control1: CGPoint(x: width * 0.69, y: height * 0.18), control2: CGPoint(x: width * 0.28, y: height * 0.53))
        hill.closeSubpath()
        // The hill sits on the bottom edge (CoreGraphics y = 0 is the bottom of the image).
        ctx.saveGState()
        let green = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!, colors: [color(0.18, 0.55, 0.26), color(0.50, 0.88, 0.36)] as CFArray, locations: [0, 1])!
        ctx.addPath(hill); ctx.clip(); ctx.drawLinearGradient(green, start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: height * 0.40), options: [])
        ctx.restoreGState()
        for _ in 0..<42 {
            let x = rng.range(40, CGFloat(width - 40)); let y = rng.range(height * 0.03, height * 0.24)
            let s = rng.range(2.0, 4.5)
            ctx.setFillColor([color(1, 0.84, 0.35, 0.8), color(1, 0.68, 0.72, 0.75), color(1, 1, 0.9, 0.7)][rng.int(0, 2)])
            ctx.fillEllipse(in: CGRect(x: x, y: y, width: s, height: s))
        }
        addBirds(ctx, width: CGFloat(width), height: CGFloat(height), rng: &rng, count: 5)
    case "ocean":
        linearGradient(ctx, rect: rect, top: color(0.11, 0.53, 0.88), bottom: color(0.59, 0.93, 0.99))
        let horizon = height * 0.33
        ctx.setFillColor(color(0.03, 0.52, 0.63, 0.84)); ctx.fill(CGRect(x: 0, y: 0, width: width, height: horizon))
        let seaGrad = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!, colors: [color(0.02, 0.62, 0.70), color(0.00, 0.26, 0.46)] as CFArray, locations: [0, 1])!
        ctx.drawLinearGradient(seaGrad, start: CGPoint(x: 0, y: horizon), end: CGPoint(x: 0, y: height), options: [])
        addCloudField(ctx, width: CGFloat(width), height: CGFloat(height), rng: &rng)
        for _ in 0..<320 {
            let x = rng.range(0, CGFloat(width)); let y = rng.range(10, horizon - 10)
            let w = rng.range(2, 18) * (y / CGFloat(height))
            ctx.setFillColor(color(1, 0.98, 0.82, rng.range(0.18, 0.73)))
            ctx.fillEllipse(in: CGRect(x: x, y: y, width: w, height: rng.range(1.0, 2.8)))
        }
        softGlow(ctx, center: CGPoint(x: width * 0.76, y: height * 0.70), radius: 230, tint: color(1, 0.95, 0.68, 0.26), alpha: 0.9)
    case "dusk":
        linearGradient(ctx, rect: rect, top: color(0.23, 0.18, 0.50), bottom: color(1.0, 0.59, 0.62))
        addCloudField(ctx, width: CGFloat(width), height: CGFloat(height), rng: &rng, dusk: true)
        for _ in 0..<10 {
            let x = rng.range(-100, CGFloat(width)); let y = rng.range(height * 0.56, height * 0.90)
            let w = rng.range(220, 540); let h = rng.range(80, 190)
            drawCloud(ctx, at: x, y: y, width: w, height: h, opacity: 0.35, rng: &rng)
        }
        softGlow(ctx, center: CGPoint(x: width * 0.78, y: height * 0.78), radius: 260, tint: color(1.0, 0.70, 0.43, 0.45), alpha: 1)
    case "night":
        linearGradient(ctx, rect: rect, top: color(0.03, 0.07, 0.24), bottom: color(0.09, 0.33, 0.65))
        addCloudField(ctx, width: CGFloat(width), height: CGFloat(height), rng: &rng)
        for _ in 0..<420 {
            let x = rng.range(30, CGFloat(width - 30)); let y = rng.range(30, height * 0.87)
            let r = rng.range(0.45, 2.2)
            let a = rng.range(0.35, 0.98)
            ctx.setFillColor(color(0.82, 0.92, 1, a)); ctx.fillEllipse(in: CGRect(x: x, y: y, width: r, height: r))
        }
        softGlow(ctx, center: CGPoint(x: width * 0.76, y: height * 0.76), radius: 180, tint: color(0.77, 0.90, 1, 0.48), alpha: 1)
        ctx.setFillColor(color(0.91, 0.96, 1, 0.94)); ctx.fillEllipse(in: CGRect(x: width * 0.72, y: height * 0.74, width: 88, height: 88))
        ctx.setFillColor(color(0.04, 0.14, 0.37, 0.50)); ctx.fillEllipse(in: CGRect(x: width * 0.75, y: height * 0.73, width: 74, height: 74))
    default: break
    }
    addGrain(ctx, width: Int(width), height: Int(height), rng: &rng, amount: 2600)
    vignette(ctx, width: width, height: height)
    let image = ctx.makeImage()!
    try saveJPEG(image, to: sceneRoot.appendingPathComponent("\(kind).jpg"), quality: 0.76)
}

func cardBackground(_ ctx: CGContext, width: CGFloat, height: CGFloat, top: CGColor, bottom: CGColor) {
    linearGradient(ctx, rect: CGRect(x: 0, y: 0, width: width, height: height), top: top, bottom: bottom)
    softGlow(ctx, center: CGPoint(x: width * 0.24, y: height * 0.72), radius: width * 0.46, tint: color(1, 1, 1, 0.18), alpha: 1)
}

func renderCard(_ index: Int, seed: UInt64) throws {
    let width = 640, height = 480
    var rng = RNG(state: seed)
    let ctx = makeContext(width: width, height: height)
    let w = CGFloat(width), h = CGFloat(height)
    switch index {
    case 1:
        cardBackground(ctx, width: w, height: h, top: color(0.10, 0.50, 0.92), bottom: color(0.61, 0.88, 1))
        ctx.setStrokeColor(color(1, 1, 1, 0.34)); ctx.setLineWidth(10); ctx.stroke(CGRect(x: 55, y: 40, width: w - 110, height: h - 80))
        drawCloud(ctx, at: 160, y: 200, width: 330, height: 145, opacity: 0.95, rng: &rng)
    case 2:
        cardBackground(ctx, width: w, height: h, top: color(0.40, 0.75, 1), bottom: color(0.12, 0.37, 0.80))
        ctx.setFillColor(color(1, 1, 1, 0.86)); ctx.fillEllipse(in: CGRect(x: 280, y: 92, width: 120, height: 150))
        ctx.setStrokeColor(color(1, 1, 1, 0.74)); ctx.setLineWidth(3); ctx.move(to: CGPoint(x: 340, y: 242)); ctx.addCurve(to: CGPoint(x: 344, y: 450), control1: CGPoint(x: 330, y: 312), control2: CGPoint(x: 370, y: 360)); ctx.strokePath()
    case 3:
        cardBackground(ctx, width: w, height: h, top: color(0.82, 0.75, 0.98), bottom: color(0.38, 0.31, 0.74))
        ctx.setStrokeColor(color(1, 1, 1, 0.86)); ctx.setLineWidth(4)
        let butterfly = CGMutablePath(); butterfly.move(to: CGPoint(x: 318, y: 224)); butterfly.addCurve(to: CGPoint(x: 176, y: 112), control1: CGPoint(x: 255, y: 202), control2: CGPoint(x: 196, y: 90)); butterfly.addCurve(to: CGPoint(x: 300, y: 269), control1: CGPoint(x: 150, y: 160), control2: CGPoint(x: 236, y: 278)); butterfly.move(to: CGPoint(x: 322, y: 224)); butterfly.addCurve(to: CGPoint(x: 466, y: 112), control1: CGPoint(x: 385, y: 202), control2: CGPoint(x: 446, y: 90)); butterfly.addCurve(to: CGPoint(x: 340, y: 269), control1: CGPoint(x: 492, y: 160), control2: CGPoint(x: 404, y: 278)); ctx.addPath(butterfly); ctx.strokePath()
    case 4:
        cardBackground(ctx, width: w, height: h, top: color(0.75, 0.91, 1), bottom: color(0.28, 0.55, 0.80))
        softGlow(ctx, center: CGPoint(x: 322, y: 244), radius: 120, tint: color(1, 1, 1, 0.92), alpha: 1)
        ctx.setFillColor(color(0.93, 0.98, 1, 0.80)); ctx.fillEllipse(in: CGRect(x: 258, y: 168, width: 128, height: 128))
        ctx.setStrokeColor(color(0.75, 0.90, 1, 0.75)); ctx.setLineWidth(3); ctx.strokeEllipse(in: CGRect(x: 258, y: 168, width: 128, height: 128))
    case 5:
        cardBackground(ctx, width: w, height: h, top: color(1.0, 0.68, 0.79), bottom: color(0.72, 0.38, 0.68))
        ctx.setFillColor(color(1, 0.86, 0.93, 0.88)); ctx.fillEllipse(in: CGRect(x: 173, y: 120, width: 150, height: 220)); ctx.fillEllipse(in: CGRect(x: 319, y: 120, width: 150, height: 220))
        ctx.setFillColor(color(1, 0.72, 0.86, 0.95)); ctx.fillEllipse(in: CGRect(x: 278, y: 205, width: 84, height: 100))
        ctx.setStrokeColor(color(1, 0.92, 0.97, 0.72)); ctx.setLineWidth(7); ctx.strokeEllipse(in: CGRect(x: 250, y: 235, width: 140, height: 100))
    case 6:
        cardBackground(ctx, width: w, height: h, top: color(0.90, 0.95, 1), bottom: color(0.45, 0.63, 0.85))
        ctx.setStrokeColor(color(1, 1, 1, 0.88)); ctx.setLineWidth(8); ctx.setLineCap(.round)
        let feather = CGMutablePath(); feather.move(to: CGPoint(x: 250, y: 420)); feather.addCurve(to: CGPoint(x: 388, y: 92), control1: CGPoint(x: 270, y: 300), control2: CGPoint(x: 370, y: 170)); feather.addCurve(to: CGPoint(x: 362, y: 337), control1: CGPoint(x: 450, y: 160), control2: CGPoint(x: 425, y: 300)); feather.addCurve(to: CGPoint(x: 250, y: 420), control1: CGPoint(x: 355, y: 368), control2: CGPoint(x: 274, y: 430)); ctx.addPath(feather); ctx.strokePath()
        ctx.setStrokeColor(color(0.72, 0.83, 0.98, 0.62)); ctx.setLineWidth(3); for i in 0..<6 { ctx.move(to: CGPoint(x: 300 + CGFloat(i) * 10, y: 356 - CGFloat(i) * 35)); ctx.addLine(to: CGPoint(x: 230 + CGFloat(i) * 16, y: 290 - CGFloat(i) * 38)); ctx.strokePath() }
    case 7:
        cardBackground(ctx, width: w, height: h, top: color(0.18, 0.26, 0.58), bottom: color(0.06, 0.08, 0.21))
        ctx.setBlendMode(.screen); for i in 0..<18 { let c = color(0.35 + CGFloat(i % 3) * 0.2, 0.75, 1, 0.30); ctx.setStrokeColor(c); ctx.setLineWidth(2); ctx.strokeEllipse(in: CGRect(x: 180 - CGFloat(i), y: 100 + CGFloat(i), width: 280 + CGFloat(i) * 2, height: 280 + CGFloat(i) * 2)) }
        ctx.setFillColor(color(0.06, 0.08, 0.18, 0.82)); ctx.fillEllipse(in: CGRect(x: 190, y: 110, width: 260, height: 260)); ctx.setFillColor(color(0.92, 0.98, 1, 0.85)); ctx.fillEllipse(in: CGRect(x: 291, y: 211, width: 58, height: 58))
    case 8:
        cardBackground(ctx, width: w, height: h, top: color(0.70, 0.91, 0.98), bottom: color(0.29, 0.64, 0.75))
        ctx.setFillColor(color(0.94, 0.99, 1, 0.56)); ctx.fillEllipse(in: CGRect(x: 210, y: 94, width: 220, height: 290))
        for _ in 0..<75 { let x = rng.range(218, 420); let y = rng.range(112, 370); let r = rng.range(1, 4); ctx.setFillColor(color(1, 1, 1, rng.range(0.25, 0.80))); ctx.fillEllipse(in: CGRect(x: x, y: y, width: r, height: r)) }
    case 9:
        cardBackground(ctx, width: w, height: h, top: color(1.0, 0.73, 0.81), bottom: color(0.53, 0.42, 0.70))
        let colors = [color(1, 0.91, 0.60, 0.92), color(0.88, 0.70, 1, 0.88), color(1, 0.58, 0.73, 0.90), color(0.65, 0.91, 0.95, 0.88)]
        for i in 0..<18 { let x = 165 + CGFloat(i % 6) * 57 + rng.range(-10, 10); let y = 300 - CGFloat(i / 6) * 38 + rng.range(-18, 18); let r = rng.range(25, 54); ctx.setFillColor(colors[i % colors.count]); ctx.fillEllipse(in: CGRect(x: x, y: y, width: r, height: r * 0.76)); ctx.setFillColor(color(0.30, 0.48, 0.30, 0.68)); ctx.setStrokeColor(color(0.30, 0.48, 0.30, 0.65)); ctx.setLineWidth(3); ctx.move(to: CGPoint(x: x + r * 0.5, y: y)); ctx.addLine(to: CGPoint(x: x + r * 0.48, y: y - 48)); ctx.strokePath() }
    case 10:
        cardBackground(ctx, width: w, height: h, top: color(0.50, 0.82, 1), bottom: color(0.20, 0.48, 0.79))
        ctx.setFillColor(color(1, 1, 1, 0.92)); let p = CGMutablePath(); p.move(to: CGPoint(x: 160, y: 252)); p.addLine(to: CGPoint(x: 430, y: 136)); p.addLine(to: CGPoint(x: 350, y: 294)); p.addLine(to: CGPoint(x: 160, y: 252)); p.closeSubpath(); ctx.addPath(p); ctx.fillPath(); ctx.setFillColor(color(0.75, 0.91, 1, 0.86)); let fold = CGMutablePath(); fold.move(to: CGPoint(x: 160, y: 252)); fold.addLine(to: CGPoint(x: 350, y: 294)); fold.addLine(to: CGPoint(x: 283, y: 220)); fold.closeSubpath(); ctx.addPath(fold); ctx.fillPath()
    default: break
    }
    addGrain(ctx, width: width, height: height, rng: &rng, amount: 500)
    vignette(ctx, width: w, height: h)
    try saveJPEG(ctx.makeImage()!, to: cardRoot.appendingPathComponent(String(format: "card-%02d.jpg", index)), quality: 0.82)
}

let sceneSeeds: [String: UInt64] = ["sky": 101, "meadow": 202, "ocean": 303, "dusk": 404, "night": 505]
for kind in ["sky", "meadow", "ocean", "dusk", "night"] { try renderScene(kind: kind, seed: sceneSeeds[kind]!) }
for index in 1...10 { try renderCard(index, seed: UInt64(900 + index * 37)) }
print("Generated 5 scenes and 10 cards in \(outputRoot.path)")
