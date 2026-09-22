import Foundation
import Vision
import CoreImage
import AppKit

// Recorta el auto del fondo con Vision, lo encuadra a su bounding box y lo centra
// dentro de un lienzo blanco de tamaño FIJO, para que todas las tarjetas del
// encabezado midan exactamente lo mismo sin importar la proporción de cada foto.
// Uso: recortar <entrada> <salida.jpg> <ancho> <alto> [calidad 0..1] [margen 0..0.2]
let a = CommandLine.arguments
guard a.count >= 5, let W = Double(a[3]), let H = Double(a[4]) else {
    FileHandle.standardError.write("uso: recortar entrada salida.jpg ancho alto [calidad] [margen]\n".data(using:.utf8)!)
    exit(2)
}
let calidad = a.count > 5 ? (Double(a[5]) ?? 0.5) : 0.5
let margen  = a.count > 6 ? (Double(a[6]) ?? 0.06) : 0.06

guard let src = CIImage(contentsOf: URL(fileURLWithPath: a[1])) else { exit(3) }
let handler = VNImageRequestHandler(ciImage: src, options: [:])
let req = VNGenerateForegroundInstanceMaskRequest()

var recortada: CIImage? = nil
do {
    try handler.perform([req])
    if let obs = req.results?.first, !obs.allInstances.isEmpty {
        let buf = try obs.generateMaskedImage(ofInstances: obs.allInstances,
                                              from: handler, croppedToInstancesExtent: true)
        recortada = CIImage(cvPixelBuffer: buf)
    }
} catch { }

let base = recortada ?? src
let sinFondo = (recortada != nil)

// Escalar "contain": el auto entra entero, con un margen para que no toque el borde.
let dispW = W * (1 - margen * 2), dispH = H * (1 - margen * 2)
let esc = min(dispW / base.extent.width, dispH / base.extent.height)
let escalada = base
    .transformed(by: CGAffineTransform(scaleX: esc, y: esc))
    .transformed(by: CGAffineTransform(translationX: -base.extent.minX * esc,
                                       y: -base.extent.minY * esc))
// Centrar en el lienzo
let dx = (W - escalada.extent.width) / 2
let dy = (H - escalada.extent.height) / 2
let centrada = escalada.transformed(by: CGAffineTransform(translationX: dx, y: dy))

let lienzo = CGRect(x: 0, y: 0, width: W, height: H)
let blanco = CIImage(color: .white).cropped(to: lienzo)
let final = centrada.composited(over: blanco).cropped(to: lienzo)

let ctx = CIContext()
guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
      (try? ctx.writeJPEGRepresentation(of: final, to: URL(fileURLWithPath: a[2]),
            colorSpace: cs,
            options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: calidad])) != nil
else { FileHandle.standardError.write("no pude escribir\n".data(using:.utf8)!); exit(4) }
print(sinFondo ? "ok" : "SIN-SUJETO")
