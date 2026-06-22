import SwiftUI

/// **AreaLayout**: Recursive description of the split screen layout grid.
/// Areas contain a unique UUID and a component type string showing what content is mounted.
public indirect enum AreaLayout: Codable, Hashable {
    case area(id: UUID, componentType: String)
    case split(direction: SplitDirection, ratio: CGFloat, first: AreaLayout, second: AreaLayout)
}

public enum SplitDirection: String, Codable {
    case horizontal
    case vertical
}
