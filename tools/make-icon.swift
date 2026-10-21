import AppKit

// Ginkgo biloba tree icon on the app background (#F6F2EA).
func rgb(_ h: UInt32, _ a: CGFloat = 1) -> NSColor {
  NSColor(srgbRed: CGFloat((h >> 16) & 255) / 255, green: CGFloat((h >> 8) & 255) / 255, blue: CGFloat(h & 255) / 255, alpha: a)
}

// Fan-shaped, two-lobed ginkgo leaf. Stem tip at origin, leaf pointing up (+y) before rotation.
func leafPath(size s: CGFloat) -> NSBezierPath {
  let p = NSBezierPath()
  let stem = s * 0.18
  p.move(to: NSPoint(x: 0, y: 0))
  // left edge of the fan
  p.curve(to: NSPoint(x: -s * 0.62, y: stem + s * 0.62),
          controlPoint1: NSPoint(x: -s * 0.08, y: stem + s * 0.12),
          controlPoint2: NSPoint(x: -s * 0.45, y: stem + s * 0.38))
  // left lobe, outer wavy edge
  p.curve(to: NSPoint(x: -s * 0.06, y: stem + s * 0.86),
          controlPoint1: NSPoint(x: -s * 0.55, y: stem + s * 0.88),
          controlPoint2: NSPoint(x: -s * 0.25, y: stem + s * 0.95))
  // the notch between the two lobes
  p.line(to: NSPoint(x: 0, y: stem + s * 0.62))
  p.line(to: NSPoint(x: s * 0.06, y: stem + s * 0.86))
  // right lobe
  p.curve(to: NSPoint(x: s * 0.62, y: stem + s * 0.62),
          controlPoint1: NSPoint(x: s * 0.25, y: stem + s * 0.95),
          controlPoint2: NSPoint(x: s * 0.55, y: stem + s * 0.88))
  p.curve(to: NSPoint(x: 0, y: 0),
          controlPoint1: NSPoint(x: s * 0.45, y: stem + s * 0.38),
          controlPoint2: NSPoint(x: s * 0.08, y: stem + s * 0.12))
  p.close()
  return p
}

func drawLeaf(at c: NSPoint, size: CGFloat, angle: CGFloat, color: NSColor) {
  let p = leafPath(size: size)
  var t = AffineTransform()
  t.translate(x: c.x, y: c.y)
  t.rotate(byDegrees: angle)
  p.transform(using: t)
  color.setFill()
  p.fill()
}

// Simple deterministic random numbers so the tree looks the same every run.
var seed: UInt64 = 20270101
func rnd() -> CGFloat {
  seed = seed &* 6364136223846793005 &+ 1442695040888963407
  return CGFloat((seed >> 33) % 10000) / 10000
}

func make(_ size: Int, _ path: String) {
  let S = CGFloat(size)
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
                             samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                             bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current?.shouldAntialias = true

  rgb(0xF6F2EA).setFill()
  NSRect(x: 0, y: 0, width: S, height: S).fill()

  // Ground shadow
  rgb(0xE4DCCD).setFill()
  NSBezierPath(ovalIn: NSRect(x: S * 0.27, y: S * 0.115, width: S * 0.46, height: S * 0.05)).fill()

  // Trunk with two main branches
  let bark = rgb(0x6B5A48)
  bark.setFill()
  let trunk = NSBezierPath()
  trunk.move(to: NSPoint(x: S * 0.455, y: S * 0.14))
  trunk.curve(to: NSPoint(x: S * 0.48, y: S * 0.46), controlPoint1: NSPoint(x: S * 0.47, y: S * 0.25), controlPoint2: NSPoint(x: S * 0.465, y: S * 0.38))
  trunk.line(to: NSPoint(x: S * 0.52, y: S * 0.46))
  trunk.curve(to: NSPoint(x: S * 0.545, y: S * 0.14), controlPoint1: NSPoint(x: S * 0.535, y: S * 0.38), controlPoint2: NSPoint(x: S * 0.53, y: S * 0.25))
  trunk.close()
  trunk.fill()
  for (dx, top) in [(-0.13, 0.62), (0.12, 0.66), (0.0, 0.74)] as [(CGFloat, CGFloat)] {
    let b = NSBezierPath()
    b.lineWidth = S * 0.018
    b.lineCapStyle = .round
    bark.setStroke()
    b.move(to: NSPoint(x: S * 0.5, y: S * 0.42))
    b.curve(to: NSPoint(x: S * (0.5 + dx), y: S * top), controlPoint1: NSPoint(x: S * 0.5, y: S * 0.52), controlPoint2: NSPoint(x: S * (0.5 + dx * 0.8), y: S * (top - 0.08)))
    b.stroke()
  }

  // Canopy: clusters of ginkgo leaves in an upright oval. Mostly sage, some autumn gold.
  let greens = [rgb(0x6F7F5C), rgb(0x7E8F67), rgb(0x8FA074), rgb(0x5F6E4E)]
  let golds = [rgb(0xD9A93E), rgb(0xE6BE5A)]
  seed = 20270101
  let cx = S * 0.5, cy = S * 0.62, rx = S * 0.30, ry = S * 0.25
  var leaves: [(NSPoint, CGFloat, CGFloat, NSColor)] = []
  for _ in 0..<260 {
    let a = rnd() * 2 * .pi
    let r = sqrt(rnd())
    let x = cx + cos(a) * r * rx
    let y = cy + sin(a) * r * ry
    // Leaves point outward from the canopy centre, like they hang off twigs.
    let outward = atan2(y - cy, x - cx) * 180 / .pi - 90
    let angle = outward + (rnd() - 0.5) * 50
    let size = S * (0.055 + rnd() * 0.03)
    let color = rnd() < 0.16 ? golds[Int(rnd() * 2) % 2] : greens[Int(rnd() * 4) % 4]
    leaves.append((NSPoint(x: x, y: y), size, angle, color))
  }
  // Draw from the back (top) to the front (bottom) for a bit of depth.
  for l in leaves.sorted(by: { $0.0.y > $1.0.y }) { drawLeaf(at: l.0, size: l.1, angle: l.2, color: l.3) }

  // A couple of falling gold leaves
  drawLeaf(at: NSPoint(x: S * 0.80, y: S * 0.30), size: S * 0.07, angle: -35, color: golds[0])
  drawLeaf(at: NSPoint(x: S * 0.22, y: S * 0.24), size: S * 0.06, angle: 25, color: golds[1])

  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: path))
}

let dir = CommandLine.arguments[1]
make(1024, dir + "/icon-1024.png")
make(512, dir + "/icon-512.png")
make(192, dir + "/icon-192.png")
make(180, dir + "/icon-180.png")
