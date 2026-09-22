import Foundation
import Vision
import CoreImage
import AppKit

// Recorta el sujeto (el auto) del fondo con Vision, lo encuadra a su bounding box
// y lo compone sobre blanco. Uso: recortar <entrada> <salida.jpg> <anchoDestino>
let args = CommandLine.arguments
guard args.count >= 4,
      let ancho = Double(args[3]) else {
    FileHandle.standardError.write("uso: recortar entrada salida.jpg ancho\n".data(using: .utf8)!)
    exit(2)
}
let entrada = URL(fileURLWithPath: args[1])
let salida  = URL(fileURLWithPath: args[2])

guard let src = CIImage(contentsOf: entrada) else {
    FileHandle.standardError.write("no pude leer la imagen\n".data(using: .utf8)!); exit(3)
}

let handler = VNImageRequestHandler(ciImage: src, options: [:])
let req = VNGenerateForegroundInstanceMaskRequest()

var recortada: CIImage? = nil
do {
    try handler.perform([req])
    if let obs = req.results?.first, !obs.allInstances.isEmpty {
        let buf = try obs.generateMaskedImage(ofInstances: obs.allInstances,
                                              from: handler,
                                              croppedToInstancesExtent: true)
        recortada = CIImage(cvPixelBuffer: buf)
    }
} catch {
    FileHandle.standardError.write("vision fallo: \(error)\n".data(using: .utf8)!)
}

// Si Vision no encontro sujeto, uso la imagen original tal cual.
let base = recortada ?? src
let sinFondo = (recortada != nil)

// Escalar al ancho pedido
let escala = ancho / base.extent.width
let escalada = base.transformed(by: CGAffineTransform(scaleX: escala, y: escala))

// Componer sobre blanco
let blanco = CIImage(color: .white).cropped(to: escalada.extent)
let final = escalada.composited(over: blanco)

let ctx = CIContext()
guard let cs = CGColorSpace(name: CGColorSpace.sRGB),
      let _ = try? ctx.writeJPEGRepresentation(of: final, to: salida,
                                               colorSpace: cs,
                                               options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.72]) else {
    FileHandle.standardError.write("no pude escribir el jpg\n".data(using: .utf8)!); exit(4)
}
print(sinFondo ? "recortado" : "SIN-SUJETO")
