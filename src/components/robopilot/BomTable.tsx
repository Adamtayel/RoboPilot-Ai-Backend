import type { ComponentLine } from "@/lib/robopilot/schema";

export function BomTable({ lines, totalUsd }: { lines: ComponentLine[]; totalUsd: number }) {
  return (
    <div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Role</th>
              <th>Component</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={`${line.name}-${i}`}>
                <td>{line.role}</td>
                <td className="mono">
                  {line.status === "approved" && line.datasheetUrl ? (
                    <a href={line.datasheetUrl} target="_blank" rel="noreferrer">
                      {line.name}
                    </a>
                  ) : (
                    line.name
                  )}
                </td>
                <td className="num">{line.quantity}</td>
                <td className="num">${line.unitPriceUsd.toFixed(2)}</td>
                <td className="num">${line.totalPriceUsd.toFixed(2)}</td>
                <td>
                  <span
                    className={
                      line.status === "approved" ? "status-pill status-pill--ok" : "status-pill status-pill--warn"
                    }
                  >
                    {line.status === "approved" ? "approved" : "not in catalog"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bom-total">
        <span>BOM total</span>
        <strong>${totalUsd.toFixed(2)}</strong>
      </div>
    </div>
  );
}
